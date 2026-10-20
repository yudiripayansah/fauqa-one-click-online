// Integrasi pihak ketiga (PRD §4.9): GA4, Meta Pixel, GTM dimuat hanya setelah pengunjung setuju lewat banner cookie.
// Verifikasi Google Search Console berupa meta tag, selalu dipasang. Murni (tanpa import) agar bisa diuji.

export const INTEGRATION_RULES = {
  ga4: /^G-[A-Z0-9]{4,15}$/,
  pixel: /^\d{6,20}$/,
  gtm: /^GTM-[A-Z0-9]{4,12}$/,
  gsc: /^[A-Za-z0-9_-]{10,100}$/,
};

const TEXT = {
  id: ['Situs ini memakai cookie untuk analitik dan iklan.', 'Setuju', 'Tolak'],
  en: ['This site uses cookies for analytics and advertising.', 'Accept', 'Decline'],
};

/** HTML untuk <head>. ID sudah divalidasi saat disimpan dan dicek ulang di sini (aman disisipkan ke script). */
export function integrationsHead(cfg = {}, locale = 'id') {
  const ok = (k) => (INTEGRATION_RULES[k].test(cfg[k] ?? '') ? cfg[k] : null);
  const out = [];
  if (ok('gsc')) out.push(`<meta name="google-site-verification" content="${ok('gsc')}">`);
  const ga = ok('ga4'), px = ok('pixel'), gtm = ok('gtm');
  if (!ga && !px && !gtm) return out.join('');
  const [msg, yes, no] = TEXT[locale] ?? TEXT.id;
  const load = [
    ga && `s('https://www.googletagmanager.com/gtag/js?id=${ga}');w.dataLayer=w.dataLayer||[];w.gtag=function(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config','${ga}');`,
    gtm && `w.dataLayer=w.dataLayer||[];dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});s('https://www.googletagmanager.com/gtm.js?id=${gtm}');`,
    px && `!function(f,b,e,v,n){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];s(v)}(w,d,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${px}');fbq('track','PageView');`,
  ].filter(Boolean).join('');
  out.push(`<script>(function(){var w=window,d=document,K='fauqa_consent',s=function(u){var e=d.createElement('script');e.async=1;e.src=u;d.head.appendChild(e)},go=function(){${load}};var c;try{c=localStorage.getItem(K)}catch(e){}if(c==='yes')return go();if(c==='no')return;d.addEventListener('DOMContentLoaded',function(){var b=d.createElement('div');b.setAttribute('role','dialog');b.setAttribute('aria-label','Cookie');b.style.cssText='position:fixed;z-index:2147483000;left:16px;right:16px;bottom:16px;max-width:520px;margin:auto;display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:12px 16px;background:#111;color:#fff;border-radius:12px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)';b.innerHTML='<span style="flex:1 1 220px">${msg}</span><button type="button" data-v="no" style="background:none;border:1px solid #fff6;color:#fff;border-radius:8px;padding:6px 12px;cursor:pointer">${no}</button><button type="button" data-v="yes" style="background:#fff;border:0;color:#111;border-radius:8px;padding:6px 12px;font-weight:600;cursor:pointer">${yes}</button>';b.addEventListener('click',function(e){var v=e.target.getAttribute('data-v');if(!v)return;try{localStorage.setItem(K,v)}catch(e){}b.remove();if(v==='yes')go()});d.body.appendChild(b)})})();</script>`);
  return out.join('');
}
