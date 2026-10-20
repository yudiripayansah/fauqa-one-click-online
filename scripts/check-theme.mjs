// Render theme bawaan dari disk (tanpa DB): routing, section group, block, schema default, t, badge, 404,
// katalog/blog/pencarian, paginate, form, redirect, sitemap. Jalankan: npm run check
import assert from 'node:assert/strict';
import { createThemeEngine } from '../lib/theme/engine.js';
import { renderSitePage, renderSitemap } from '../lib/theme/site.js';
import { loadThemeDir, themeKeys } from './theme-files.mjs';
import { parseSchema } from '../lib/theme/engine.js';
import { cleanSectionList, cleanSettingsData } from '../lib/theme/sanitize.js';
import { validateFile, validateTheme } from '../lib/theme/validate.js';
import { readThemeZip } from '../lib/theme/zip.js';
import { zipSync, strToU8 } from 'fflate';
import { readdirSync, readFileSync } from 'node:fs';
import { brandSettings, contrast, fillIndex, themeTranslations } from '../lib/preset.js';
import { themeFields } from '../lib/translate.js';
import { integrationsHead } from '../lib/site/integrations.js';

const site = { id: 's1', name: 'Acme', slug: 'acme', default_locale: 'id', locales: ['id', 'en'], show_badge: true,
  settings: { tagline: 'Baja ringan', contact: { email: 'halo@example.com', phone: '0812 3456', whatsapp: '0812-0000-1111' } } };
const img = { id: 'f1', name: 'baja.jpg', folder: '', mime: 'image/jpeg', size: 1000, width: 1600, height: 1200, alt: 'Baja',
  src: 'https://cdn.test/baja.jpg', variants: { 400: 'https://cdn.test/400.webp', 800: 'https://cdn.test/800.webp' } };
const pdf = { id: 'f2', name: 'brosur.pdf', folder: '', mime: 'application/pdf', size: 2000, src: 'https://cdn.test/brosur.pdf', variants: {} };
const product = (i, extra = {}) => ({ id: `p${i}`, handle: `produk-${i}`, title: `Produk ${i}`, summary: `Ringkasan ${i}`, media: [], specs: [], price_label: '',
  tags: [], downloads: [], cta: { type: 'inquiry' }, related_ids: [], created_at: `2026-01-${String(i).padStart(2, '0')}`, seo: {}, ...extra });
const content = {
  pages: [{ id: 'pg1', handle: 'tentang-kami', title: 'Tentang Kami', body: '<p>Sejak 2010.</p>', seo: {} },
    { id: 'pg2', handle: 'kontak', title: 'Kontak', body: '<p>Hubungi kami.</p>', template_suffix: 'contact', seo: {} }],
  menus: [{ handle: 'main-menu', title: 'Menu', items: [{ title: 'Beranda', url: '/' }, { title: 'Tentang', url: '/pages/tentang-kami' }] }],
  files: [img, pdf],
  products: [
    product(1, { media: ['f1'], specs: [{ label: 'Tebal', value: '0,75 mm' }], price_label: 'Mulai Rp 85.000', downloads: ['f2'], tags: ['atap'], related_ids: ['p2'] }),
    product(2, { cta: { type: 'whatsapp' }, tags: ['atap'] }),
    ...Array.from({ length: 13 }, (_, i) => product(i + 3)),
  ],
  collections: [{ id: 'c1', handle: 'atap', title: 'Rangka Atap', body: '', image: null, rule: 'tag', rule_tag: 'atap', sort: 'title', product_ids: [], seo: {} }],
  blogs: [{ id: 'b1', handle: 'berita', title: 'Berita' }],
  articles: [{ id: 'a1', blog_id: 'b1', handle: 'pabrik-baru', title: 'Pabrik Baru', excerpt: 'Kami membuka pabrik.', cover: 'f1', author: 'Tim', tags: [], published_at: '2026-03-15T00:00:00Z', seo: {} }],
  redirects: [{ id: 'r1', from_path: '/produk-lama', to_url: '/products/produk-1' }],
};
const loaders = {
  body: async (kind, id) => `<p>Isi ${kind} ${id}</p>`,
  search: async (q) => (q === 'produk' ? [{ type: 'product', id: 'p1' }, { type: 'article', id: 'a1' }] : []),
};

for (const key of themeKeys()) {
  const files = loadThemeDir(key).text;
  const engine = createThemeEngine(files, { assetBase: '/theme-assets/t/1/' });
  const render = (path, opts = {}) => renderSitePage(engine, { site, content, path, baseUrl: 'https://acme.example.com', loaders, ...opts });

  const home = await render('/');
  assert.equal(home.status, 200);
  assert.match(home.html, /<title>Acme<\/title>/);
  assert.match(home.html, /id="fauqa-section-template--index__hero"/);
  assert.match(home.html, /href="\/theme-assets\/t\/1\/base.css"/);
  assert.match(home.html, /class="fauqa-badge"/);
  assert.match(home.html, /Langsung ke konten/, 'filter t (id)');
  assert.match(home.html, /hreflang="en" href="https:\/\/acme.example.com\/en"/);
  assert.match(home.html, /<a href="\/" aria-current="page">Beranda<\/a>/);
  const homeTypes = Object.values(JSON.parse(files['templates/index.json']).sections).map((x) => x.type);
  if (homeTypes.includes('featured-products')) assert.match(home.html, /href="\/products\/produk-1"/, 'produk unggulan');
  if (homeTypes.includes('blog-posts')) {
    assert.match(home.html, /href="\/blogs\/berita\/pabrik-baru"/, 'artikel terbaru');
    assert.match(home.html, /15 Maret 2026/, 'tanggal berbahasa Indonesia');
  }
  assert.doesNotMatch(home.html, /data-fauqa-section/, 'atribut editor hanya di design mode');
  assert.doesNotMatch(home.html, /{%|{{|Liquid error/, 'tidak ada Liquid mentah');

  // Terjemahan (bahasa kedua): konten, menu, teks section; yang kosong tetap bahasa utama.
  const translated = { ...content, translations: { en: {
    'page:pg1:title': 'About Us', 'page:pg1:body': '<p>Since 2010.</p>', 'menu:main-menu:items.1.title': 'About',
    'product:p1:body': '<p>English body</p>', 'theme:t1:template--index__hero.heading': 'Built for industry',
  } } };
  const renderEn = (path) => render(path, { content: translated, themeId: 't1' });
  assert.match((await renderEn('/en')).html, /Built for industry/, 'teks section theme');
  assert.match((await renderEn('/en')).html, />About<\/a>/, 'menu');
  assert.doesNotMatch((await render('/', { content: translated, themeId: 't1' })).html, /Built for industry/, 'bahasa utama tidak berubah');
  const enPage = (await renderEn('/en/pages/tentang-kami')).html;
  assert.match(enPage, /Since 2010/);
  assert.match(enPage, /<title>About Us \| Acme<\/title>/);
  assert.match((await renderEn('/en/pages/kontak')).html, /Hubungi kami/, 'fallback bahasa utama');
  assert.match((await renderEn('/en/products/produk-1')).html, /English body/, 'isi produk');

  const page = await render('/pages/tentang-kami');
  assert.equal(page.status, 200);
  assert.match(page.html, /Sejak 2010/);
  assert.match(page.html, /<title>Tentang Kami \| Acme<\/title>/);
  assert.match(page.html, /"@type":"BreadcrumbList"/);

  const contact = await render('/pages/kontak', { query: { form: { type: 'contact', ok: true } } });
  assert.match(contact.html, /<form method="post" action="\/contact" id="contact_form"/, 'template page.contact + tag form');
  assert.match(contact.html, /name="contact\[website\]"/, 'honeypot');
  assert.match(contact.html, /pesan Anda sudah terkirim/, 'form.posted_successfully');

  const en = await render('/en/pages/tentang-kami');
  assert.match(en.html, /<html lang="en">/);
  assert.match(en.html, /Skip to content/, 'filter t (en)');
  assert.match(en.html, /href="\/en\/pages\/tentang-kami" aria-current="page"/);

  const prod = await render('/products/produk-1');
  assert.equal(prod.status, 200);
  assert.match(prod.html, /srcset="https:\/\/cdn.test\/400.webp 400w, https:\/\/cdn.test\/800.webp 800w"/, 'image_tag srcset');
  assert.match(prod.html, /0,75 mm/, 'spesifikasi');
  assert.match(prod.html, /Mulai Rp 85.000/);
  assert.match(prod.html, /href="https:\/\/cdn.test\/brosur.pdf" download/);
  assert.match(prod.html, /Isi product p1/, 'body dari loader');
  assert.match(prod.html, /name="product_id" value="p1"/, 'form inquiry');
  assert.match(prod.html, /href="\/products\/produk-2"/, 'produk terkait');
  assert.match(prod.html, /"@type":"Product"/);
  const wa = await render('/products/produk-2');
  assert.match(wa.html, /href="https:\/\/wa.me\/081200001111\?text=/, 'CTA WhatsApp');

  const all = await render('/collections/all', { query: { page: 2 } });
  assert.match(all.html, /aria-current="page">2</, 'paginate halaman 2');
  assert.match(all.html, /Produk 15/);
  assert.doesNotMatch(all.html, /Produk 1</);
  const col = await render('/collections/atap');
  assert.match(col.html, /Produk 1[\s\S]*Produk 2/, 'koleksi berdasar tag, urut judul');
  assert.match((await render('/collections')).html, /2 produk/);

  const art = await render('/blogs/berita/pabrik-baru');
  assert.match(art.html, /Isi article a1/);
  assert.match(art.html, /"@type":"Article"/);
  assert.match((await render('/blogs/berita')).html, /Pabrik Baru/);

  const search = await render('/search', { query: { q: 'produk' } });
  assert.match(search.html, /2 hasil untuk/);
  assert.match(search.html, /noindex/);

  const missing = await render('/pages/tidak-ada');
  assert.equal(missing.status, 404);
  assert.match(missing.html, /noindex/);
  assert.deepEqual(await render('/produk-lama'), { status: 301, location: '/products/produk-1', redirectId: 'r1' });

  const design = await render('/', { design: true });
  assert.match(design.html, /data-fauqa-block="[^"]+" data-fauqa-section="template--index__hero"/);

  // Theme editor: satu section (template & section group), template alternatif via view, bridge di mode desain
  const one = await render('/', { design: true, editor: { only: { file: 'template', sectionId: 'hero' } } });
  assert.match(one.html, /^<div id="fauqa-section-template--index__hero"/);
  assert.doesNotMatch(one.html, /<html/);
  const head = await render('/', { design: true, editor: { only: { file: 'sections/header-group.json', sectionId: 'header' } } });
  assert.match(head.html, /^<div id="fauqa-section-header-group__header"/);
  const viewed = await render('/pages/tentang-kami', { design: true, editor: { view: 'contact', bridge: { appOrigin: 'https://app.test', token: 't', path: '/', renderUrl: '/api/render-section' } } });
  assert.match(viewed.html, /id="contact_form"/, 'view=contact memakai page.contact.json');
  assert.match(viewed.html, /"appOrigin":"https:\/\/app.test"/, 'bridge disisipkan');
  assert.doesNotMatch(home.html, /appOrigin/, 'bridge hanya di editor');

  const sitemap = renderSitemap(site, content, 'https://acme.example.com');
  assert.match(sitemap, /<loc>https:\/\/acme.example.com\/products\/produk-1<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/acme.example.com\/en\/blogs\/berita\/pabrik-baru<\/loc>/);
  // Sanitasi simpanan editor terhadap schema
  const schemas = Object.fromEntries(Object.entries(files).filter(([k]) => /^sections\/.*\.liquid$/.test(k)).map(([k, v]) => [k.slice(9, -7), parseSchema(v)]));
  const opts = { cleanHtml: (h) => h.replace(/<script[\s\S]*?<\/script>/g, ''), canCode: false };
  const tpl = { sections: {
    m: { type: 'multicolumn', settings: { columns: 99 } },
    r: { type: 'rich-text', settings: { align: 'raksasa', text: '<p>ok</p><script>alert(1)</script>' } },
  }, order: ['m', 'r'] };
  const clean = cleanSectionList(tpl, null, schemas, opts);
  assert.equal(clean.sections.r.settings.align, 'left', 'select di luar opsi → default');
  assert.equal(clean.sections.m.settings.columns, 4, 'range dijepit ke max');
  assert.equal(clean.sections.r.settings.text, '<p>ok</p>', 'richtext disanitasi');
  assert.throws(() => cleanSectionList({ sections: { c: { type: 'custom-liquid', settings: { custom_liquid: '{{ 1 }}' } } }, order: ['c'] }, null, schemas, opts), /owner\/admin/, 'liquid hanya owner/admin');
  assert.throws(() => cleanSectionList({ sections: { x: { type: 'tidak-ada' } }, order: ['x'] }, null, schemas, opts), /tidak dikenal/);
  const settingsSchema = JSON.parse(files['config/settings_schema.json']);
  const sd = cleanSettingsData({ current: { color_accent: 'javascript:1', page_width: 99999 } }, JSON.parse(files['config/settings_data.json']), settingsSchema, opts);
  const defs = Object.fromEntries(settingsSchema.flatMap((g) => g.settings ?? []).map((d) => [d.id, d]));
  assert.equal(sd.current.page_width, defs.page_width.max, 'range theme settings dijepit');
  assert.equal(sd.current.color_accent, defs.color_accent.default, 'warna tidak valid → default');

  // Section tambahan Fase 3 & custom Liquid dirender
  const extra = createThemeEngine({ ...files, 'templates/index.json': JSON.stringify({ sections: {
    f: { type: 'faq', blocks: { q: { type: 'question', settings: { question: 'Garansi?' } } }, block_order: ['q'] },
    s: { type: 'stats', blocks: { a: { type: 'stat', settings: { value: '99', label: 'Klien' } } }, block_order: ['a'] },
    c: { type: 'custom-liquid', settings: { custom_liquid: '<p>{{ site.name | upcase }}</p>' } },
    v: { type: 'video', settings: { video_url: 'https://youtu.be/abc123' } },
  }, order: ['f', 's', 'c', 'v'] }) }, { assetBase: '/a/' });
  const ex = await renderSitePage(extra, { site, content, path: '/', baseUrl: 'https://acme.example.com', loaders });
  assert.match(ex.html, /<summary>Garansi\?<\/summary>/);
  assert.match(ex.html, /<dd>99<\/dd>/);
  assert.match(ex.html, /<p>ACME<\/p>/, 'setting liquid dirender');
  assert.match(ex.html, /youtube-nocookie.com\/embed\/abc123/);
  assert.match(ex.html, /sections\.css/);
  // Validator (PRD §6.7): theme bawaan harus lolos penuh
  const v = validateTheme(files);
  assert.ok(v.ok, `${key}: ${JSON.stringify(v.errors.slice(0, 3))}`);
  console.log(`check-theme ${key}: OK`);
}

// Preset industri → beranda setiap theme tetap valid; warna brand menjaga kontras.
for (const f of readdirSync(new URL('../presets/', import.meta.url))) {
  const p = JSON.parse(readFileSync(new URL(`../presets/${f}`, import.meta.url), 'utf8'));
  for (const loc of ['id', 'en']) assert.equal(Object.keys(p[loc].pages).length, 3, `${f}: 3 halaman`);
  for (const key of themeKeys()) {
    const { text } = loadThemeDir(key);
    const tpl = fillIndex(JSON.parse(text['templates/index.json']), p.id, { about: '/pages/tentang-kami', contact: '/pages/kontak' });
    const v = validateTheme({ ...text, 'templates/index.json': JSON.stringify(tpl) });
    assert.ok(v.ok, `${f} × ${key}: ${JSON.stringify(v.errors.slice(0, 2))}`);
    const hero = Object.values(tpl.sections).find((s) => s.type === 'hero');
    assert.equal(hero.settings.heading, p.id.hero.heading);
  }
}
{
  const p = JSON.parse(readFileSync(new URL('../presets/umum.json', import.meta.url), 'utf8'));
  const { text } = loadThemeDir('lumen');
  const links = { about: '/pages/tentang-kami', contact: '/pages/kontak' };
  const tr = themeTranslations(JSON.parse(text['templates/index.json']), p.id, p.en, links);
  assert.equal(tr['template--index__hero.heading'], p.en.hero.heading);
  const fields = themeFields({ ...text, 'templates/index.json': JSON.stringify(fillIndex(JSON.parse(text['templates/index.json']), p.id, links)) }, 'templates/index.json');
  assert.ok(fields.some((f) => f.field === 'template--index__hero.heading' && f.source === p.id.hero.heading), 'katalog teks theme');
  assert.ok(Object.keys(tr).every((k) => fields.some((f) => f.field === k) || /\.(link|style)$/.test(k)), 'terjemahan wizard cocok dengan katalog');
}
for (const accent of ['#FFE600', '#1F5FA8', '#22C55E']) {
  const cur = brandSettings({ current: 'A', presets: { A: { color_background: '#FFFFFF', color_ink: '#111827' } } }, null, accent).current;
  assert.ok(contrast(cur.color_accent, cur.color_on_accent) >= 4.5, `teks di atas ${accent}`);
  assert.ok(contrast(cur.color_accent_text, cur.color_background) >= 4.5, `teks aksen ${accent}`);
}

// Integrasi pihak ketiga: hanya ID valid yang dipasang; tanpa ID tidak ada banner.
{
  const head = integrationsHead({ ga4: 'G-ABC123', pixel: '123456789', gtm: 'GTM-X1Y2Z3', gsc: 'abcdefghijk' }, 'en');
  assert.match(head, /google-site-verification" content="abcdefghijk"/);
  assert.match(head, /gtag\/js\?id=G-ABC123/);
  assert.match(head, /Accept/);
  assert.equal(integrationsHead({ ga4: "G-1');alert(1)//" }), '', 'ID tidak valid diabaikan');
  assert.equal(integrationsHead({}), '');
}

// Validator: kasus gagal
const bad = (key, src) => validateFile(key, src).errors;
assert.match(bad('../etc/passwd', 'x')[0].message, /Folder tidak dikenal/);
assert.match(bad('assets/run.exe', null)[0].message, /tidak diizinkan/);
assert.equal(bad('snippets/a.liquid', '{% if x %}\n\n{% endfor %}')[0].line, 3, 'nomor baris error Liquid');
assert.match(bad('templates/index.json', '{"sections": {,}}')[0].message, /JSON tidak valid/);
assert.match(bad('sections/x.liquid', '<p></p>{% schema %}{"settings":[{"type":"range","id":"a"}]}{% endschema %}')[0].message, /min, max, step/);
assert.match(bad('sections/x.liquid', '{% schema %}{"settings":[{"type":"warna","id":"a"}]}{% endschema %}')[0].message, /tidak dikenal/);
assert.equal(validateFile('snippets/login.liquid', '<input type="password">').warnings.length, 1, 'peringatan phishing');
const missing = validateTheme({ 'layout/theme.liquid': '{{ content_for_layout }}', 'templates/index.json': '{"sections":{"a":{"type":"nope"}},"order":["a"]}' });
assert.ok(!missing.ok);
assert.ok(missing.errors.some((e) => e.file === 'templates/page.json'));
assert.ok(missing.errors.some((e) => /tidak ada \(sections\/nope/.test(e.message)));
console.log('check-theme validator: OK');

// ZIP: folder pembungkus dibuang, theme bawaan lolos, path traversal ditolak
const lumen = loadThemeDir('lumen');
const zipped = zipSync(Object.fromEntries([...Object.entries(lumen.text).map(([k, v]) => [`lumen-main/${k}`, strToU8(v)]), ['__MACOSX/._x', strToU8('x')], ['lumen-main/assets/logo.png', new Uint8Array([137, 80, 78, 71])]]));
const z = readThemeZip(zipped);
assert.ok(z.report.ok, JSON.stringify(z.report.errors.slice(0, 3)));
assert.ok('layout/theme.liquid' in z.files && 'assets/logo.png' in z.binaries);
assert.ok(!Object.keys(z.files).some((k) => k.includes('MACOSX')));
assert.ok(!readThemeZip(zipSync({ '../evil.liquid': strToU8('x') })).report.ok, 'path traversal ditolak');
console.log('check-theme zip: OK');
