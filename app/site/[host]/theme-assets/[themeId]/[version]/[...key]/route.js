// Aset theme (assets/*). URL memuat versi theme → aman di-cache selamanya.
import { getSiteByHost, getThemeFiles } from '@/lib/site/data';

const TYPES = { css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', json: 'application/json', txt: 'text/plain' };

export async function GET(_req, { params }) {
  const { host, themeId, version, key } = await params;
  const site = await getSiteByHost(decodeURIComponent(host));
  const bundle = site && /^\d+$/.test(version) && (await getThemeFiles(themeId, Number(version)));
  // Theme privat: hanya theme milik situs ini atau theme bawaan.
  if (!bundle || (bundle.siteId && bundle.siteId !== site.id)) return new Response('Not found', { status: 404 });
  const name = `assets/${key.map(decodeURIComponent).join('/')}`;
  const body = bundle.files[name];
  if (body == null) return new Response('Not found', { status: 404 });
  const ext = name.split('.').pop();
  return new Response(body, {
    headers: {
      'content-type': `${TYPES[ext] ?? 'application/octet-stream'}; charset=utf-8`,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
