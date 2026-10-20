// Analytics tanpa cookie (PRD §4.9): script kecil di situs → POST /api/collect → analytics_events (service role).
import { createHmac } from 'node:crypto';
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|axios|node-fetch|monitor|pingdom/i;
const EVENT = /^[a-z0-9_:-]{1,60}$/i;

// Script klien (< 2 KB): pageview + klik WhatsApp/telepon/email/unduhan/link keluar + elemen [data-fauqa-event].
// Kirim form dicatat di server saat kiriman berhasil (lib/site/contact.js).
export const collectScript = `<script>(function(){var d=document,l=location,s=function(n,p){try{navigator.sendBeacon('/api/collect',JSON.stringify({n:n,u:l.pathname,r:d.referrer,q:l.search,p:p||{}}))}catch(e){}};s('pageview');d.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a,[data-fauqa-event]');if(!a)return;var c=a.getAttribute('data-fauqa-event');if(c)return s(c,{label:(a.textContent||'').trim().slice(0,80)});var h=a.href||'';if(/wa\\.me|whatsapp\\.com/.test(h))s('whatsapp');else if(/^tel:/.test(h))s('phone');else if(/^mailto:/.test(h))s('email');else if(a.hasAttribute('download')||/\\.(pdf|docx?|xlsx?|pptx?|zip)(\\?|$)/i.test(h))s('download',{file:decodeURIComponent(h.split('?')[0].split('/').pop()).slice(0,100)});else if(a.host&&a.host!==l.host)s('outbound',{host:a.host})},true)})();</script>`;

const ipOf = (req) => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';

// Salt harian dari rahasia server + tanggal UTC: hash pengunjung berganti setiap hari dan IP tidak pernah disimpan.
function visitorHash(req, siteId) {
  const salt = `${process.env.PREVIEW_SECRET ?? 'dev'}:${new Date().toISOString().slice(0, 10)}`;
  return createHmac('sha256', salt).update(`${siteId}:${ipOf(req)}:${req.headers.get('user-agent') ?? ''}`).digest('hex').slice(0, 32);
}

function agent(ua) {
  const device = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Lainnya';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Lainnya';
  return { device, browser, os };
}

/** Catat satu event (tanpa menunggu insert selesai). path = path halaman di situs, query = search string. */
export function trackEvent(req, site, host, { type, name, path, query = '', referrer = '', props = {} }) {
  const ua = req.headers.get('user-agent') ?? '';
  if (!ua || BOT.test(ua) || site.status !== 'published') return;
  if (/(^|;\s*)fauqa_preview=/.test(req.headers.get('cookie') ?? '')) return; // anggota situs (preview) tidak dihitung
  const locale = /^\/([a-z]{2})(\/|$)/.exec(path)?.[1];
  const product = type === 'pageview' && /^(?:\/[a-z]{2})?\/products\/([a-z0-9-]+)/.exec(path)?.[1];
  let refHost = null;
  try { refHost = referrer ? new URL(referrer).host.replace(/^www\./, '').toLowerCase() : null; } catch { /* referrer rusak */ }
  if (refHost === host.replace(/^www\./, '')) refHost = null;
  const qs = new URLSearchParams(query);
  const utm = Object.fromEntries(['source', 'medium', 'campaign'].map((k) => [k, qs.get(`utm_${k}`)?.slice(0, 100)]).filter(([, v]) => v));
  const city = req.headers.get('x-vercel-ip-city');
  const row = {
    site_id: site.id, type, name, path: path.slice(0, 500),
    locale: locale && site.locales.includes(locale) ? locale : site.default_locale,
    referrer_host: refHost?.slice(0, 200) ?? null, utm,
    country: req.headers.get('x-vercel-ip-country') || null, city: city ? decodeURIComponent(city).slice(0, 100) : null,
    ...agent(ua), visitor_hash: visitorHash(req, site.id),
    props: { ...props, ...(product ? { product } : {}) },
  };
  after(async () => {
    const { error } = await createAdminClient().from('analytics_events').insert(row);
    if (error) console.error('[collect]', error.message);
  });
}

/** POST /api/collect dari script situs (body teks JSON lewat sendBeacon). */
export async function handleCollect(req, site, host) {
  const empty = new Response(null, { status: 204 });
  if (!site || Number(req.headers.get('content-length') ?? 0) > 4096) return empty;
  let b;
  try { b = JSON.parse(await req.text()); } catch { return empty; }
  const name = String(b?.n ?? '');
  const path = String(b?.u ?? '');
  if (!EVENT.test(name) || !path.startsWith('/')) return empty;
  const props = Object.fromEntries(Object.entries(b.p && typeof b.p === 'object' ? b.p : {}).slice(0, 5)
    .filter(([k, v]) => /^[a-z_]{1,20}$/.test(k) && ['string', 'number'].includes(typeof v)).map(([k, v]) => [k, String(v).slice(0, 100)]));
  trackEvent(req, site, host, { type: name === 'pageview' ? 'pageview' : 'event', name, path, query: String(b.q ?? '').slice(0, 500), referrer: String(b.r ?? '').slice(0, 500), props });
  return empty;
}
