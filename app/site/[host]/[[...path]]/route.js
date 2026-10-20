// Render situs tenant (PRD §7). proxy.js me-rewrite <host>/<path> → /site/<host>/<path>.
import { NextResponse, after } from 'next/server';
import { canonicalHost, getSiteByHost, getSiteContent, renderEditor, renderPublished, renderSite } from '@/lib/site/data';
import { handleContact } from '@/lib/site/contact';
import { handleCollect } from '@/lib/site/analytics';
import { renderRobots, renderSitemap } from '@/lib/theme/site';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyPreviewToken } from '@/lib/preview';
import { APP_URL, PROTOCOL } from '@/lib/hosts';
import { accessCookieName, accessToken, checkPassword, hasAccess } from '@/lib/password';

const PREVIEW_COOKIE = 'fauqa_preview';

const page = (status, title, text) => new Response(
  `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>` +
  `<body style="margin:0;min-height:100dvh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;color:#222;background:#f6f7f8;text-align:center;padding:24px">` +
  `<div><h1 style="font-size:1.5rem;margin:0 0 .5rem">${title}</h1><p style="margin:0;color:#666">${text}</p></div></body></html>`,
  { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

const text = (body, type) => new Response(body, { headers: { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'public, max-age=0, s-maxage=3600' } });

async function resolve(params) {
  const { host: rawHost, path = [] } = await params;
  return { host: decodeURIComponent(rawHost), pathname: '/' + path.map(decodeURIComponent).join('/') };
}

// Hasil render → Response (HTML, atau redirect 301 dari tabel redirects).
function respond(result, cache, baseUrl) {
  if (result.location) {
    if (result.redirectId) after(() => createAdminClient().rpc('hit_redirect', { p_id: result.redirectId }));
    return NextResponse.redirect(new URL(result.location, baseUrl), 301);
  }
  return new Response(result.html, { status: result.status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cache } });
}

export async function GET(req, { params }) {
  const { host, pathname } = await resolve(params);
  const sp = req.nextUrl.searchParams;

  // ?preview=<token> dari admin → simpan di cookie host-only situs ini, lalu buang dari URL.
  const token = sp.get('preview');
  if (token) {
    // URL publik situs (req.nextUrl sudah di-rewrite ke /site/<host>/… oleh proxy).
    const qs = new URLSearchParams(sp);
    qs.delete('preview');
    const url = new URL(`${PROTOCOL}://${host}${pathname}${qs.size ? `?${qs}` : ''}`);
    const res = NextResponse.redirect(url);
    const ok = verifyPreviewToken(token);
    if (ok) res.cookies.set(PREVIEW_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', secure: url.protocol === 'https:', maxAge: ok.exp - Math.floor(Date.now() / 1000) });
    return res;
  }

  const site = await getSiteByHost(host);
  if (!site) return page(404, 'Situs tidak ditemukan', 'Alamat ini belum terhubung ke situs mana pun.');

  const viewer = verifyPreviewToken(req.cookies.get(PREVIEW_COOKIE)?.value);
  const preview = viewer?.s === site.id && site.status !== 'suspended';
  const baseUrl = `${PROTOCOL}://${host}`;
  // Satu alamat per situs (PRD §4.10): subdomain/domain lain → domain utama. Preview anggota tetap di host-nya.
  const canonical = canonicalHost(site);
  if (!preview && host !== canonical) return NextResponse.redirect(`${PROTOCOL}://${canonical}${pathname}${req.nextUrl.search}`, 301);
  if (!preview) {
    if (site.status === 'suspended') return page(451, 'Situs dinonaktifkan', 'Situs ini sedang dinonaktifkan oleh Fauqa One Click.');
    // Offline/draft → halaman "segera hadir"; terbit + password → form password. Keduanya dari templates/password.json theme.
    const locked = site.status === 'published' && site.password_hash && !hasAccess(site.id, site.password_hash, req.cookies.get(accessCookieName(site.id))?.value);
    if (site.status !== 'published' || locked) {
      if (pathname === '/robots.txt') return text('User-agent: *\nDisallow: /\n', 'text/plain');
      const passwordForm = locked ? { action: '/password', error: sp.has('password_error') } : null;
      const result = await renderSite(site, host, pathname, { forceTemplate: 'password', passwordForm }).catch(() => null);
      if (!result) return page(503, `${site.name} segera hadir`, 'Situs ini sedang disiapkan. Silakan kembali lagi nanti.');
      return respond(result, 'private, no-store', baseUrl);
    }
  }

  if (pathname === '/robots.txt') return text(renderRobots(site, baseUrl), 'text/plain');
  if (pathname === '/sitemap.xml') return text(renderSitemap(site, await getSiteContent(site.id), baseUrl), 'application/xml');

  const pageNo = Math.max(1, Number.parseInt(sp.get('page') ?? '1', 10) || 1);
  const formType = sp.get('form_type');
  const form = formType && (sp.get('contact_posted') === 'true' ? { type: formType, ok: true } : sp.get('form_error') ? { type: formType, error: sp.get('form_error').slice(0, 200) } : null);
  const q = sp.get('q');

  // Preview, pencarian, dan status form selalu dirender ulang; sisanya dari cache.
  if (preview || q != null || form) {
    const result = await renderSite(site, host, pathname, { preview, query: { page: pageNo, q, form }, themeId: preview ? viewer.t : null });
    return respond(result, preview || form ? 'private, no-store' : 'public, max-age=0, s-maxage=10', baseUrl);
  }
  // CDN hanya menahan sebentar: render sudah di-cache server (tag situs dibuang saat disimpan), jadi edit/hapus/suspend
  // terlihat pengunjung dalam ±10 detik, bukan menunggu revalidasi stale-while-revalidate yang panjang.
  return respond(await renderPublished(host, pathname, pageNo), 'public, max-age=0, s-maxage=10, stale-while-revalidate=30', baseUrl);
}

export async function POST(req, { params }) {
  const { host, pathname } = await resolve(params);
  if (pathname === '/__fauqa/preview' || pathname === '/api/render-section') return editorPreview(req, host, pathname);
  if (pathname === '/password') return enterPassword(req, host);
  if (pathname === '/api/collect') return handleCollect(req, await getSiteByHost(host), host);
  if (!/^(\/[a-z]{2})?\/contact$/.test(pathname)) return new Response('Method not allowed', { status: 405 });
  const site = await getSiteByHost(host);
  if (!site || site.status === 'suspended') return new Response('Not found', { status: 404 });
  return handleContact(req, site, host);
}

// Theme editor (PRD §4.3): halaman penuh lewat POST form ke iframe (/__fauqa/preview) dan satu section
// (/api/render-section, dipanggil bridge di iframe). Token preview bertanda tangan membawa situs + theme; tanpa cookie.
async function editorPreview(req, host, pathname) {
  if (Number(req.headers.get('content-length') ?? 0) > 1024 * 1024) return new Response('Payload terlalu besar', { status: 413 });
  const full = pathname === '/__fauqa/preview';
  let body;
  try {
    body = full ? Object.fromEntries(await req.formData()) : await req.json();
    if (typeof body.overrides === 'string') body.overrides = JSON.parse(body.overrides || '{}');
  } catch {
    return new Response('Permintaan tidak valid', { status: 400 });
  }
  const token = verifyPreviewToken(body.token);
  const site = token?.t && (await getSiteByHost(host));
  if (!site || token.s !== site.id) return new Response('Token preview tidak valid atau kedaluwarsa. Muat ulang editor.', { status: 403 });

  const path = /^\/(?!\/)[^\s]*$/.test(body.path ?? '') ? body.path : '/';
  const view = /^[a-z0-9_-]{1,40}$/.test(body.view ?? '') ? body.view : null;
  const overrides = body.overrides && typeof body.overrides === 'object' ? body.overrides : {};
  const only = !full && typeof body.sectionId === 'string' && /^(template|sections\/[a-z0-9_-]+\.json)$/.test(body.file ?? '')
    ? { file: body.file, sectionId: body.sectionId } : null;
  if (!full && !only) return new Response('Section tidak valid', { status: 400 });

  const result = await renderEditor(site, host, {
    themeId: token.t, path, view, overrides, only,
    bridge: full ? { appOrigin: APP_URL, token: body.token, path, view, renderUrl: '/api/render-section' } : null,
  });
  return new Response(result.html ?? '', {
    status: result.location ? 200 : result.status,
    headers: {
      'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store',
      // Hanya editor (origin admin) yang boleh membingkai preview.
      'content-security-policy': `frame-ancestors ${APP_URL}`,
    },
  });
}

// Masuk situs berpassword (PRD §4.1). Cookie berisi HMAC dari hash → otomatis batal bila password diganti.
// ponytail: tanpa rate limit per IP; tambahkan (seperti /contact) bila ada laporan brute force.
async function enterPassword(req, host) {
  const site = await getSiteByHost(host);
  const base = `${PROTOCOL}://${host}`;
  if (!site?.password_hash) return NextResponse.redirect(new URL('/', base), 303);
  const fd = await req.formData();
  if (!checkPassword(String(fd.get('password') ?? '').slice(0, 200), site.password_hash)) {
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.redirect(new URL('/?password_error=1', base), 303);
  }
  const res = NextResponse.redirect(new URL('/', base), 303);
  res.cookies.set(accessCookieName(site.id), accessToken(site.id, site.password_hash), { httpOnly: true, sameSite: 'lax', path: '/', secure: PROTOCOL === 'https', maxAge: 30 * 24 * 3600 });
  return res;
}
