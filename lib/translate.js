// Katalog teks yang bisa diterjemahkan (PRD §4.10). Kunci item: '<type>:<key>' (mis. 'page:<uuid>', 'theme:templates/index.json').
// Setiap field: { field, label, kind: 'text'|'textarea'|'richtext', source }.
import { parseSchema } from './theme/engine.js';

const TEXT_TYPES = { text: 'text', inline_richtext: 'text', textarea: 'textarea', richtext: 'richtext' };
const SEO = (seo = {}) => [
  { field: 'seo_title', label: 'Judul SEO', kind: 'text', source: seo.title ?? '' },
  { field: 'seo_description', label: 'Deskripsi SEO', kind: 'textarea', source: seo.description ?? '' },
];

/** Field teks section theme dari satu file template/section group. id render mengikuti engine.renderPage. */
export function themeFields(files, key) {
  let data;
  try { data = JSON.parse(files[key]); } catch { return []; }
  const base = key.startsWith('templates/') ? `template--${key.slice(10).split('.')[0]}` : key.slice(9, -5);
  const out = [];
  for (const sid of data.order ?? Object.keys(data.sections ?? {})) {
    const sec = data.sections?.[sid];
    if (!sec || files[`sections/${sec.type}.liquid`] == null) continue;
    let schema;
    try { schema = parseSchema(files[`sections/${sec.type}.liquid`]); } catch { continue; }
    const id = `${base}__${sid}`;
    const add = (defs = [], values = {}, prefix, label) => {
      for (const d of defs) {
        const kind = TEXT_TYPES[d.type];
        const source = values[d.id] ?? d.default ?? '';
        if (kind && typeof source === 'string' && source.trim()) out.push({ field: `${prefix}.${d.id}`, label: `${label} · ${d.label ?? d.id}`, kind, source });
      }
    };
    add(schema.settings, sec.settings, id, schema.name ?? sec.type);
    const blockDefs = Object.fromEntries((schema.blocks ?? []).map((b) => [b.type, b]));
    for (const bid of sec.block_order ?? Object.keys(sec.blocks ?? {})) {
      const b = sec.blocks?.[bid];
      if (b && blockDefs[b.type]) add(blockDefs[b.type].settings, b.settings, `${id}.${bid}`, `${schema.name ?? sec.type} · ${blockDefs[b.type].name ?? b.type}`);
    }
  }
  return out;
}

const menuFields = (items = [], path = 'items', depth = '') => items.flatMap((it, i) => [
  { field: `${path}.${i}.title`, label: `${depth}${it.title}`, kind: 'text', source: it.title ?? '' },
  ...menuFields(it.items, `${path}.${i}.items`, `${depth}— `),
]);

/** Semua item yang bisa diterjemahkan, dikelompokkan. Isi panjang produk/artikel dimuat lewat `withBody`. */
export async function loadCatalog(supabase, siteId) {
  const [{ data: site }, pages, products, collections, blogs, articles, menus] = await Promise.all([
    supabase.from('sites').select('settings, live_theme_id').eq('id', siteId).single(),
    ...['pages', 'products', 'collections', 'blogs', 'articles', 'menus'].map((t) => supabase.from(t).select({
      pages: 'id, title, body, seo', products: 'id, title, summary, price_label, seo', collections: 'id, title, body, seo',
      blogs: 'id, title', articles: 'id, title, excerpt, seo', menus: 'handle, title, items',
    }[t]).eq('site_id', siteId).order(t === 'menus' ? 'handle' : 'title').then((r) => r.data ?? [])),
  ]);
  const s = site.settings ?? {};
  const { data: themeFiles } = await supabase.from('theme_files').select('key, content').eq('theme_id', site.live_theme_id)
    .or('key.like.templates/%,key.like.sections/%').not('content', 'is', null);
  const files = Object.fromEntries((themeFiles ?? []).map((f) => [f.key, f.content]));
  const templates = Object.keys(files).filter((k) => /^(templates\/.*|sections\/.*-group)\.json$/.test(k)).sort();

  return [
    ['Situs', [{ type: 'site', key: 'site', label: 'Tagline & SEO', fields: [{ field: 'tagline', label: 'Tagline', kind: 'text', source: s.tagline ?? '' }, ...SEO(s.seo)] }]],
    ['Halaman', pages.map((p) => ({ type: 'page', key: p.id, label: p.title, fields: [{ field: 'title', label: 'Judul', kind: 'text', source: p.title }, { field: 'body', label: 'Isi', kind: 'richtext', source: p.body }, ...SEO(p.seo)] }))],
    ['Produk', products.map((p) => ({ type: 'product', key: p.id, label: p.title, fields: [{ field: 'title', label: 'Nama', kind: 'text', source: p.title }, { field: 'summary', label: 'Ringkasan', kind: 'textarea', source: p.summary }, { field: 'price_label', label: 'Label harga', kind: 'text', source: p.price_label }, { field: 'body', label: 'Deskripsi', kind: 'richtext', source: null }, ...SEO(p.seo)] }))],
    ['Koleksi', collections.map((c) => ({ type: 'collection', key: c.id, label: c.title, fields: [{ field: 'title', label: 'Judul', kind: 'text', source: c.title }, { field: 'body', label: 'Deskripsi', kind: 'richtext', source: c.body }, ...SEO(c.seo)] }))],
    ['Blog', blogs.map((b) => ({ type: 'blog', key: b.id, label: b.title, fields: [{ field: 'title', label: 'Judul', kind: 'text', source: b.title }] }))],
    ['Artikel', articles.map((a) => ({ type: 'article', key: a.id, label: a.title, fields: [{ field: 'title', label: 'Judul', kind: 'text', source: a.title }, { field: 'excerpt', label: 'Ringkasan', kind: 'textarea', source: a.excerpt }, { field: 'body', label: 'Isi', kind: 'richtext', source: null }, ...SEO(a.seo)] }))],
    ['Menu', menus.map((m) => ({ type: 'menu', key: m.handle, label: m.title, fields: menuFields(m.items) }))],
    ['Teks theme', templates.map((k) => ({ type: 'theme', key: site.live_theme_id, file: k, id: `theme:${k}`, label: k.replace(/^templates\/|^sections\/|\.json$/g, ''), fields: themeFields(files, k) }))],
  ].map(([group, items]) => [group, items.map((it) => ({ ...it, id: it.id ?? `${it.type}:${it.key}` })).map((it) => ({ ...it, fields: it.fields.filter((f) => f.source !== '') }))]);
}

/** Isi panjang (body) produk/artikel untuk item terpilih. */
export async function withBody(supabase, item) {
  if (!['product', 'article'].includes(item.type)) return item;
  const { data } = await supabase.from(item.type === 'product' ? 'products' : 'articles').select('body').eq('id', item.key).single();
  return { ...item, fields: item.fields.map((f) => (f.source === null ? { ...f, source: data?.body ?? '' } : f)).filter((f) => f.source) };
}
