// Isi situs baru dari konten terstruktur (preset industri atau hasil AI, PRD §4.2). Bentuk konten `c` per bahasa:
// { tagline, hero{kicker,heading,text,cta}, about{heading,text}, services{heading,items[[judul,teks]]}, stats[[nilai,label]],
//   faq[[tanya,jawab]], cta{heading,text,button}, pages{handle:{title,body}}, products[{title,summary,price,specs[[l,v]]}],
//   collection, articles[{title,excerpt,body}] }
// Tanpa import alias agar bisa diuji dari scripts/check-*.mjs.

const handle = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

// Kontras WCAG antara dua warna hex.
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** settings_data.json theme: pakai preset gaya `style`, timpa warna aksen dengan token kontras yang aman. */
export function brandSettings(data, style, accent) {
  const name = data.presets?.[style] ? style : typeof data.current === 'string' ? data.current : null;
  const cur = { ...(name ? data.presets[name] : data.current) };
  if (/^#[0-9a-f]{6}$/i.test(accent ?? '')) {
    const bg = cur.color_background ?? '#FFFFFF';
    const ink = cur.color_ink ?? '#111111';
    cur.color_accent = accent.toUpperCase();
    cur.color_on_accent = contrast(accent, '#FFFFFF') >= 4.5 ? '#FFFFFF' : contrast(accent, ink) >= 4.5 ? ink : '#000000';
    cur.color_accent_text = contrast(accent, bg) >= 4.5 ? cur.color_accent : ink;
  }
  return { ...data, current: cur };
}

/** templates/index.json theme diisi teks `c` menurut tipe section; section lain (galeri, testimoni, …) tetap contoh theme. */
export function fillIndex(tpl, c, links) {
  const out = JSON.parse(JSON.stringify(tpl).replaceAll('/pages/kontak', links.contact).replaceAll('/pages/tentang-kami', links.about));
  const list = (type, rows, map) => Object.fromEntries(rows.map((r, i) => [`${type}-${i + 1}`, { type, settings: map(r) }]));
  for (const s of Object.values(out.sections)) {
    const set = (k, v) => { if (v != null) s.settings = { ...s.settings, [k]: v }; };
    const blocks = (type, rows, map) => { s.blocks = list(type, rows, map); s.block_order = Object.keys(s.blocks); };
    if (s.type === 'hero') {
      if (s.settings?.kicker != null) set('kicker', c.hero.kicker);
      set('heading', c.hero.heading); set('text', c.hero.text);
      const first = s.block_order?.find((id) => s.blocks[id].type === 'button');
      if (first) s.blocks[first].settings = { ...s.blocks[first].settings, label: c.hero.cta, link: links.contact };
    } else if (s.type === 'multicolumn') {
      set('heading', c.services.heading);
      blocks('column', c.services.items, ([title, text]) => ({ title, text }));
    } else if (s.type === 'image-with-text') {
      set('heading', c.about.heading); set('text', `<p>${esc(c.about.text)}</p>`);
    } else if (s.type === 'stats') {
      blocks('stat', c.stats, ([value, label]) => ({ value, label }));
    } else if (s.type === 'faq') {
      blocks('question', c.faq, ([question, answer]) => ({ question, answer: `<p>${esc(answer)}</p>` }));
    } else if (s.type === 'cta-banner') {
      set('heading', c.cta.heading); set('text', c.cta.text); set('button_label', c.cta.button);
    } else if (s.type === 'featured-products') {
      set('heading', c.collection);
    }
  }
  return out;
}

const NAV = {
  id: { home: 'Beranda', news: 'Berita', newsHandle: 'berita' },
  en: { home: 'Home', news: 'News', newsHandle: 'news' },
};

/**
 * Tulis konten ke situs yang baru dibuat create_site (klien RLS owner). Menimpa halaman awal, membuat produk,
 * koleksi, artikel, menu, dan template beranda. Semua konten ditandai `sample` sampai diedit.
 */
export async function applyContent(supabase, { siteId, themeId, locale, name, c, c2 = null, sample = 'preset', style, accent, settings = {} }) {
  const ok = ({ data, error }) => { if (error) throw new Error(`${error.message} ${error.details ?? ''}`); return data; };
  const t = NAV[locale] ?? NAV.id;
  const now = Date.now();
  // Urutan key jsonb tidak dijamin: halaman diambil menurut key preset.
  const pages = ['tentang-kami', 'kontak', 'kebijakan-privasi'].map((k) => c.pages[k]);
  const [aboutH, contactH, privacyH] = pages.map((pg, i) => handle(pg.title) || ['tentang-kami', 'kontak', 'kebijakan-privasi'][i]);
  const links = { about: `/pages/${aboutH}`, contact: `/pages/${contactH}` };

  // Halaman: create_site membuat tentang-kami & kontak (template kontak sudah terpasang).
  const pageIds = [];
  for (const [i, old] of ['tentang-kami', 'kontak'].entries()) {
    pageIds.push(ok(await supabase.from('pages').update({ handle: [aboutH, contactH][i], title: pages[i].title, body: pages[i].body, sample }).eq('site_id', siteId).eq('handle', old).select('id').single()).id);
  }
  pageIds.push(ok(await supabase.from('pages').insert({ site_id: siteId, handle: privacyH, title: pages[2].title, body: pages[2].body, status: 'published', published_at: new Date(now).toISOString(), sample }).select('id').single()).id);

  const products = ok(await supabase.from('products').insert(c.products.map((p, i) => ({
    site_id: siteId, handle: handle(p.title) || `item-${i + 1}`, title: p.title, summary: p.summary, body: `<p>${esc(p.summary)}</p>`,
    price_label: p.price ?? '', specs: (p.specs ?? []).map(([label, value]) => ({ label, value })), status: 'published', position: i, sample,
  }))).select('id'));
  const colHandle = handle(c.collection) || 'produk';
  const col = ok(await supabase.from('collections').insert({ site_id: siteId, handle: colHandle === 'all' ? 'produk' : colHandle, title: c.collection }).select('id, handle').single());
  ok(await supabase.from('collection_products').insert(products.map((p, i) => ({ collection_id: col.id, product_id: p.id, position: i }))));

  const blog = ok(await supabase.from('blogs').update({ handle: t.newsHandle, title: t.news }).eq('site_id', siteId).select('id').single());
  const articles = ok(await supabase.from('articles').insert(c.articles.map((a, i) => ({
    site_id: siteId, blog_id: blog.id, handle: handle(a.title) || `artikel-${i + 1}`, title: a.title, excerpt: a.excerpt, body: a.body,
    author: name, status: 'published', published_at: new Date(now - i * 864e5).toISOString(), sample,
  }))).select('id'));

  const item = (title, url) => ({ title, url });
  ok(await supabase.from('menus').update({ items: [item(t.home, '/'), item(c.collection, `/collections/${col.handle}`), item(pages[0].title, links.about), item(t.news, `/blogs/${t.newsHandle}`), item(pages[1].title, links.contact)] })
    .eq('site_id', siteId).eq('handle', 'main-menu'));
  ok(await supabase.from('menus').update({ items: [item(pages[0].title, links.about), item(pages[1].title, links.contact), item(pages[2].title, `/pages/${privacyH}`)] })
    .eq('site_id', siteId).eq('handle', 'footer'));

  // Theme: beranda + warna/gaya.
  const files = ok(await supabase.from('theme_files').select('id, key, content').eq('theme_id', themeId).in('key', ['templates/index.json', 'config/settings_data.json']));
  let index = null;
  for (const f of files) {
    const data = JSON.parse(f.content);
    if (f.key === 'templates/index.json') index = data;
    const next = f.key === 'templates/index.json' ? fillIndex(data, c, links) : brandSettings(data, style, accent);
    ok(await supabase.from('theme_files').update({ content: JSON.stringify(next, null, 2) }).eq('id', f.id));
  }

  const { data: s } = await supabase.from('sites').select('settings').eq('id', siteId).single();
  ok(await supabase.from('sites').update({ settings: { ...s.settings, ...settings, tagline: c.tagline, seo: { ...s.settings?.seo, description: c.hero.text } } }).eq('id', siteId));

  // Bahasa kedua (PRD §4.10): teks contoh yang sama dalam bahasa lain, disimpan sebagai terjemahan.
  if (!c2) return;
  const locale2 = locale === 'id' ? 'en' : 'id';
  const t2 = NAV[locale2];
  const pages2 = ['tentang-kami', 'kontak', 'kebijakan-privasi'].map((k) => c2.pages[k]);
  const rows = [];
  const add = (type, key, fields) => {
    for (const [field, value] of Object.entries(fields)) if (value) rows.push({ site_id: siteId, locale: locale2, resource_type: type, resource_key: String(key), field, value });
  };
  add('site', 'site', { tagline: c2.tagline, seo_description: c2.hero.text });
  pageIds.forEach((id, i) => add('page', id, { title: pages2[i].title, body: pages2[i].body }));
  products.forEach((p, i) => c2.products[i] && add('product', p.id, { title: c2.products[i].title, summary: c2.products[i].summary, price_label: c2.products[i].price, body: `<p>${esc(c2.products[i].summary)}</p>` }));
  add('collection', col.id, { title: c2.collection });
  add('blog', blog.id, { title: t2.news });
  articles.forEach((a, i) => c2.articles[i] && add('article', a.id, { title: c2.articles[i].title, excerpt: c2.articles[i].excerpt, body: c2.articles[i].body }));
  add('menu', 'main-menu', Object.fromEntries([t2.home, c2.collection, pages2[0].title, t2.news, pages2[1].title].map((v, i) => [`items.${i}.title`, v])));
  add('menu', 'footer', Object.fromEntries(pages2.map((pg, i) => [`items.${i}.title`, pg.title])));
  if (index) add('theme', themeId, themeTranslations(index, c, c2, links));
  ok(await supabase.from('translations').insert(rows));
}

/** Selisih teks beranda antara dua bahasa → field terjemahan theme ('template--index__<sid>.<setting>'). */
export function themeTranslations(tpl, c, c2, links) {
  const a = fillIndex(tpl, c, links);
  const b = fillIndex(tpl, c2, links);
  const out = {};
  const diff = (base, x = {}, y = {}) => { for (const [k, v] of Object.entries(y)) if (typeof v === 'string' && v !== x[k]) out[`${base}.${k}`] = v; };
  for (const [sid, sec] of Object.entries(b.sections)) {
    const id = `template--index__${sid}`;
    diff(id, a.sections[sid]?.settings, sec.settings);
    for (const [bid, blk] of Object.entries(sec.blocks ?? {})) if (a.sections[sid]?.blocks?.[bid]) diff(`${id}.${bid}`, a.sections[sid].blocks[bid].settings, blk.settings);
  }
  return out;
}
