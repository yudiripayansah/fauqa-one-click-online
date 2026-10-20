// Data situs publik (service role, hanya baca) + cache (PRD §7).
// Tag cache: `site:<id>` — panggil updateTag(siteTag(id)) setiap konten/theme/pengaturan situs disimpan.
import { cacheTag, cacheLife } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { classifyHost, PROTOCOL, ROOT_DOMAIN } from '@/lib/hosts';
import { createThemeEngine } from '@/lib/theme/engine';
import { renderSitePage } from '@/lib/theme/site';
import { collectScript } from '@/lib/site/analytics';

export const siteTag = (id) => `site:${id}`;
export const hostTag = (host) => `host:${host}`;

const SITE_COLS = 'id, name, slug, status, suspended_reason, default_locale, locales, settings, show_badge, password_hash, live_theme_id, themes:live_theme_id (id, version), primary:domains!sites_primary_domain_id_fkey (hostname, status)';

export async function getSiteByHost(host) {
  'use cache';
  cacheTag(hostTag(host));
  const kind = classifyHost(host);
  const db = createAdminClient();
  const sites = () => db.from('sites').select(SITE_COLS).is('deleted_at', null);
  let data = null;
  if (kind.slug) data = (await sites().eq('slug', kind.slug).maybeSingle()).data;
  if (!data && (kind.slug || kind.custom)) {
    // Custom domain aktif, atau subdomain lama setelah ganti slug (alias 'platform' sampai redirect_until).
    const { data: d } = await db.from('domains').select('site_id, type, verification').eq('hostname', kind.custom ?? host.toLowerCase()).eq('status', 'active').maybeSingle();
    if (d && (d.type === 'custom' || d.verification?.redirect_until > new Date().toISOString())) data = (await sites().eq('id', d.site_id).maybeSingle()).data;
  }
  if (data) cacheTag(siteTag(data.id));
  return data;
}

/** Host kanonis situs: custom domain utama yang aktif, atau subdomain platform. Host lain di-redirect 301 ke sini. */
export const canonicalHost = (site) => (site.primary?.status === 'active' ? site.primary.hostname : `${site.slug}.${ROOT_DOMAIN}`);

export const themeAssetUrl = (path) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/theme-assets/${path}`;
export const fileUrl = (path) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/site-files/${path}`;

// Ambil semua baris (PostgREST membatasi 1000 per permintaan).
async function all(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

// Daftar konten yang dipakai render (tanpa isi panjang produk/artikel). `drafts` = sertakan draft (preview anggota).
// ponytail: seluruh daftar situs di-cache sebagai satu objek; pecah per tipe bila situs mendekati kuota 500 produk + 500 artikel.
export async function getSiteContent(siteId, drafts = false) {
  'use cache';
  cacheTag(siteTag(siteId));
  const db = createAdminClient();
  const pub = (q) => (drafts ? q : q.eq('status', 'published'));
  const now = new Date().toISOString();
  const [pages, menus, files, products, collections, links, blogs, articles, redirects, trs] = await Promise.all([
    all(() => {
      const q = pub(db.from('pages').select('id, handle, title, body, template_suffix, seo').eq('site_id', siteId));
      return drafts ? q : q.or(`published_at.is.null,published_at.lte.${now}`); // jadwal publish
    }),
    all(() => db.from('menus').select('handle, title, items').eq('site_id', siteId)),
    all(() => db.from('files').select('id, name, folder, storage_path, mime, size, width, height, variants, alt').eq('site_id', siteId)),
    all(() => pub(db.from('products').select('id, handle, title, summary, media, specs, price_label, tags, downloads, cta, related_ids, template_suffix, seo, created_at').eq('site_id', siteId)).order('position').order('created_at', { ascending: false })),
    all(() => db.from('collections').select('id, handle, title, body, image, rule, rule_tag, sort, seo').eq('site_id', siteId).order('position')),
    all(() => db.from('collection_products').select('collection_id, product_id, collections!inner (site_id)').eq('collections.site_id', siteId).order('position')),
    all(() => db.from('blogs').select('id, handle, title').eq('site_id', siteId).order('title')),
    all(() => {
      const q = pub(db.from('articles').select('id, blog_id, handle, title, excerpt, cover, author, tags, published_at, seo').eq('site_id', siteId));
      return (drafts ? q : q.lte('published_at', now)).order('published_at', { ascending: false, nullsFirst: true });
    }),
    all(() => db.from('redirects').select('id, from_path, to_url').eq('site_id', siteId)),
    all(() => db.from('translations').select('locale, resource_type, resource_key, field, value').eq('site_id', siteId)),
  ]);
  const translations = {};
  for (const t of trs) (translations[t.locale] ??= {})[`${t.resource_type}:${t.resource_key}:${t.field}`] = t.value;
  return {
    pages, menus, products, blogs, articles, redirects, translations,
    files: files.map((f) => ({ ...f, src: fileUrl(f.storage_path), variants: Object.fromEntries(Object.entries(f.variants ?? {}).map(([w, p]) => [w, fileUrl(p)])) })),
    collections: collections.map((c) => ({ ...c, product_ids: links.filter((l) => l.collection_id === c.id).map((l) => l.product_id) })),
  };
}

// Isi panjang satu produk/artikel (halaman detail).
export async function getBody(siteId, kind, id) {
  'use cache';
  cacheTag(siteTag(siteId));
  const { data } = await createAdminClient().from(kind === 'product' ? 'products' : 'articles').select('body').eq('site_id', siteId).eq('id', id).maybeSingle();
  return data?.body ?? '';
}

// Pencarian situs (PRD §4.11): Postgres full-text search, hanya konten published. Tidak di-cache.
export async function searchSite(siteId, q, drafts = false) {
  const db = createAdminClient();
  const fts = (table, cols = 'id') => {
    let query = db.from(table).select(cols).eq('site_id', siteId).textSearch('search', q, { type: 'websearch', config: 'simple' }).limit(20);
    return drafts ? query : query.eq('status', 'published');
  };
  const [products, articles, pages] = await Promise.all([fts('products'), fts('articles'), fts('pages')]);
  return [
    ...(products.data ?? []).map((r) => ({ type: 'product', id: r.id })),
    ...(articles.data ?? []).map((r) => ({ type: 'article', id: r.id })),
    ...(pages.data ?? []).map((r) => ({ type: 'page', id: r.id })),
  ];
}

// File teks theme. Kunci (themeId, version) → isi tidak pernah berubah, cukup cacheLife panjang.
export async function getThemeFiles(themeId, version) {
  'use cache';
  cacheLife('max');
  const db = createAdminClient();
  const { data: theme } = await db.from('themes').select('site_id').eq('id', themeId).maybeSingle();
  if (!theme) return null;
  const files = {};
  const assetUrls = {}; // aset biner (gambar/font) di bucket theme-assets
  for (const f of await all(() => db.from('theme_files').select('key, content, storage_path').eq('theme_id', themeId))) {
    if (f.content != null) files[f.key] = f.content;
    else assetUrls[f.key] = themeAssetUrl(f.storage_path);
  }
  return { siteId: theme.site_id, version, files, assetUrls };
}

// Engine (template ter-parse) disimpan di memori per versi theme.
// ponytail: Map global dengan batas 50 entri (hapus yang tertua); LRU bila jumlah situs aktif per instance jauh lebih besar.
const engines = new Map();
async function getEngine(themeId, version) {
  const key = `${themeId}:${version}`;
  if (!engines.has(key)) {
    const bundle = await getThemeFiles(themeId, version);
    if (!bundle) return null;
    if (engines.size >= 50) engines.delete(engines.keys().next().value);
    engines.set(key, createThemeEngine(bundle.files, { assetBase: `/theme-assets/${themeId}/${version}/`, assetUrls: bundle.assetUrls }));
  }
  return engines.get(key);
}

export async function renderSite(site, host, path, { preview = false, query = {}, themeId = null, forceTemplate = null, passwordForm = null } = {}) {
  // Preview theme tersimpan (token preview membawa t = id theme, harus milik situs ini).
  const theme = themeId
    ? (await createAdminClient().from('themes').select('id, version').eq('id', themeId).eq('site_id', site.id).maybeSingle()).data ?? site.themes
    : site.themes;
  const engine = theme && (await getEngine(theme.id, theme.version));
  if (!engine) return { status: 503, html: '<!doctype html><title>Situs belum punya theme</title><p>Situs ini belum punya theme aktif.</p>' };
  const content = await getSiteContent(site.id, preview);
  const loaders = {
    body: (kind, id) => getBody(site.id, kind, id),
    search: (q) => searchSite(site.id, q, preview),
    // Turnstile gratis hanya untuk hostname yang terdaftar: subdomain platform saja; custom domain cukup honeypot + rate limit.
    turnstileSiteKey: (classifyHost(host).slug && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) || null,
  };
  // Script analytics hanya untuk pengunjung (bukan preview anggota, bukan halaman password/segera hadir).
  const headExtra = preview || forceTemplate ? '' : collectScript;
  return renderSitePage(engine, { site, content, path, query, baseUrl: `${PROTOCOL}://${host}`, loaders, forceTemplate, passwordForm, themeId: theme.id, headExtra });
}

// Theme editor (PRD §4.3): render theme mana pun milik situs + perubahan yang belum disimpan, mode desain.
// overrides = { 'templates/index.json': {...}, 'config/settings_data.json': {...} } (sudah divalidasi pemanggil).
const EDITABLE = /^(templates\/[a-z0-9_-]+(\.[a-z0-9_-]+)?\.json|sections\/[a-z0-9_-]+\.json|config\/settings_data\.json)$/;
export async function renderEditor(site, host, { themeId, path, view, overrides = {}, only, bridge }) {
  const { data: theme } = await createAdminClient().from('themes').select('id, version').eq('id', themeId).eq('site_id', site.id).maybeSingle();
  if (!theme) return { status: 404, html: 'Theme tidak ditemukan.' };
  const bundle = await getThemeFiles(theme.id, theme.version);
  const files = { ...bundle.files };
  for (const [k, v] of Object.entries(overrides)) if (EDITABLE.test(k) && v && typeof v === 'object') files[k] = JSON.stringify(v);
  const engine = createThemeEngine(files, { assetBase: `/theme-assets/${theme.id}/${theme.version}/`, assetUrls: bundle.assetUrls });
  const content = await getSiteContent(site.id, true);
  const [pathname, qs = ''] = path.split('?');
  const q = new URLSearchParams(qs);
  return renderSitePage(engine, {
    site, content, path: pathname, query: { page: Number(q.get('page')) || 1, q: q.get('q') }, baseUrl: `${PROTOCOL}://${host}`, design: true,
    loaders: { body: (kind, id) => getBody(site.id, kind, id), search: (term) => searchSite(site.id, term, true) },
    editor: { view, only, bridge }, themeId: theme.id,
  });
}

// Situs published untuk pengunjung: hasil render di-cache per (host, path, halaman paginate).
export async function renderPublished(host, path, page) {
  'use cache';
  const site = await getSiteByHost(host);
  if (!site) return null;
  cacheTag(siteTag(site.id));
  return renderSite(site, host, path, { query: { page } });
}
