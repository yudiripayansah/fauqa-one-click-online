// Routing situs + objek global Liquid (PRD §6.5, §7). Murni: data dimuat pemanggil (lib/site/data.js atau tes).
// site    = { id, name, slug, default_locale, locales, settings, show_badge }
// content = { pages, menus, files, products, collections, blogs, articles, redirects } — lihat getSiteContent.
// loaders = { body(kind, id) → html, search(q) → [{ type, id }] } untuk data yang tidak ikut cache daftar.

import { bridgeScript } from './bridge.js';
import { PROTOCOL, ROOT_DOMAIN } from '../hosts.js';
import { integrationsHead } from '../site/integrations.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const stripTags = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const LANG_NAMES = { id: 'Bahasa Indonesia', en: 'English' };

// Array yang juga bisa diakses per handle: {% for c in collections %} dan collections['atap'].
const indexed = (list) => Object.assign([...list], Object.fromEntries(list.map((x) => [x.handle, x])));

// '/en/pages/about' → { locale: 'en', prefix: '/en', rest: '/pages/about' }
export function splitLocale(path, site) {
  const m = /^\/([a-z]{2})(\/.*)?$/.exec(path);
  if (m && m[1] !== site.default_locale && site.locales.includes(m[1])) return { locale: m[1], prefix: `/${m[1]}`, rest: m[2] || '/' };
  return { locale: site.default_locale, prefix: '', rest: path };
}

const ROUTES = [
  [/^\/$/, () => ({ template: 'index' })],
  [/^\/pages\/([a-z0-9-]+)$/, (m) => ({ template: 'page', handle: m[1] })],
  [/^\/products\/([a-z0-9-]+)$/, (m) => ({ template: 'product', handle: m[1] })],
  [/^\/collections$/, () => ({ template: 'list-collections' })],
  [/^\/collections\/([a-z0-9-]+)$/, (m) => ({ template: 'collection', handle: m[1] })],
  [/^\/blogs\/([a-z0-9-]+)$/, (m) => ({ template: 'blog', handle: m[1] })],
  [/^\/blogs\/([a-z0-9-]+)\/([a-z0-9-]+)$/, (m) => ({ template: 'article', blog: m[1], handle: m[2] })],
  [/^\/search$/, () => ({ template: 'search' })],
];

export function matchRoute(rest) {
  const p = rest.length > 1 ? rest.replace(/\/+$/, '') : rest;
  for (const [re, fn] of ROUTES) {
    const m = re.exec(p);
    if (m) return fn(m);
  }
  return { template: '404' };
}

function linklist(menu, prefix, current) {
  const map = (items = []) => items.map((it) => {
    // Link internal mengikuti bahasa aktif.
    const url = it.url?.startsWith('/') ? (prefix + (it.url === '/' && prefix ? '' : it.url)) || '/' : it.url;
    const links = map(it.items);
    return { title: it.title, url, links, current: url === current, child_active: links.some((l) => l.current || l.child_active) };
  });
  return { handle: menu.handle, title: menu.title, links: map(menu.items) };
}

export const poweredByLink = (slug) =>
  `<a class="fauqa-badge" href="${PROTOCOL}://${ROOT_DOMAIN}/?ref=${encodeURIComponent(slug)}" target="_blank" rel="noopener">Dibuat dengan Fauqa One Click</a>`
  + ` · <a class="fauqa-badge-report" href="${PROTOCOL}://${ROOT_DOMAIN}/laporkan?situs=${encodeURIComponent(slug)}" target="_blank" rel="nofollow noopener">Laporkan situs</a>`;

const BADGE_FALLBACK = (slug) =>
  `<div style="text-align:center;padding:12px;font:13px/1.4 system-ui,sans-serif;background:#fff;color:#444;border-top:1px solid #eee">${poweredByLink(slug)}</div>`;

// Terjemahan bahasa kedua (PRD §4.10). tr = { 'page:<id>:title': 'About', ... }; field kosong = bahasa utama.
export function localize(site, content, tr) {
  if (!tr || !Object.keys(tr).length) return { site, content };
  const t = (type, key, field, fallback) => tr[`${type}:${key}:${field}`] || fallback;
  const seo = (type, key, v = {}) => ({ ...v, title: t(type, key, 'seo_title', v.title), description: t(type, key, 'seo_description', v.description) });
  const menuItems = (handle, items = [], path = 'items') => items.map((it, i) => ({
    ...it, title: t('menu', handle, `${path}.${i}.title`, it.title), items: menuItems(handle, it.items, `${path}.${i}.items`),
  }));
  const s = site.settings ?? {};
  return {
    site: { ...site, settings: { ...s, tagline: t('site', 'site', 'tagline', s.tagline), seo: seo('site', 'site', s.seo) } },
    content: {
      ...content,
      pages: content.pages.map((p) => ({ ...p, title: t('page', p.id, 'title', p.title), body: t('page', p.id, 'body', p.body), seo: seo('page', p.id, p.seo) })),
      products: content.products.map((p) => ({ ...p, title: t('product', p.id, 'title', p.title), summary: t('product', p.id, 'summary', p.summary),
        price_label: t('product', p.id, 'price_label', p.price_label), seo: seo('product', p.id, p.seo) })),
      collections: content.collections.map((c) => ({ ...c, title: t('collection', c.id, 'title', c.title), body: t('collection', c.id, 'body', c.body), seo: seo('collection', c.id, c.seo) })),
      blogs: content.blogs.map((b) => ({ ...b, title: t('blog', b.id, 'title', b.title) })),
      articles: content.articles.map((a) => ({ ...a, title: t('article', a.id, 'title', a.title), excerpt: t('article', a.id, 'excerpt', a.excerpt), seo: seo('article', a.id, a.seo) })),
      menus: content.menus.map((m) => ({ ...m, items: menuItems(m.handle, m.items) })),
    },
  };
}

// Objek Liquid dari data mentah. Dibuat sekali per render.
function buildObjects(site, content, prefix) {
  const fileById = new Map(content.files.map((f) => [f.id, f]));
  const image = (id) => {
    const f = fileById.get(id);
    return f && f.mime?.startsWith('image/') ? { id: f.id, src: f.src, alt: f.alt, width: f.width, height: f.height, variants: f.variants } : null;
  };
  const fileObj = (id) => {
    const f = fileById.get(id);
    return f && { name: f.name, url: f.src, size: f.size, mime: f.mime, extension: f.name.split('.').pop() };
  };
  const filesByName = {};
  for (const f of content.files) {
    const img = { src: f.src, alt: f.alt, width: f.width, height: f.height, variants: f.variants };
    filesByName[f.name] = img;
    if (f.folder) filesByName[`${f.folder}/${f.name}`] = img;
  }

  const wa = String(site.settings?.contact?.whatsapp ?? '').replace(/\D/g, '');
  const product = (p) => {
    const images = p.media.map(image).filter(Boolean);
    const cta = p.cta ?? { type: 'inquiry' };
    const ctaUrl = cta.type === 'whatsapp' && wa
      ? `https://wa.me/${wa}?text=${encodeURIComponent(`Halo, saya tertarik dengan ${p.title}`)}`
      : cta.type === 'link' ? cta.url : '#inquiry_form';
    return {
      id: p.id, handle: p.handle, title: p.title, url: `${prefix}/products/${p.handle}`,
      summary: p.summary, description: p.summary, price: p.price_label, price_label: p.price_label,
      tags: p.tags, specs: p.specs, images, media: images, featured_image: images[0] ?? null,
      downloads: p.downloads.map(fileObj).filter(Boolean),
      cta: { type: cta.type, label: cta.label || (cta.type === 'whatsapp' ? 'Tanya via WhatsApp' : cta.type === 'link' ? 'Selengkapnya' : 'Minta penawaran'), url: ctaUrl },
      template_suffix: p.template_suffix, seo: p.seo ?? {}, related_ids: p.related_ids, created_at: p.created_at,
    };
  };
  const products = content.products.map(product);
  const productById = new Map(products.map((p) => [p.id, p]));

  const collection = (c) => {
    let list = c.rule === 'tag' ? products.filter((p) => p.tags.includes(c.rule_tag)) : c.product_ids.map((id) => productById.get(id)).filter(Boolean);
    if (c.sort === 'title') list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (c.sort === 'newest') list = [...list].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return { id: c.id, handle: c.handle, title: c.title, description: c.body, url: `${prefix}/collections/${c.handle}`,
      image: image(c.image) ?? list[0]?.featured_image ?? null, products: list, products_count: list.length, seo: c.seo ?? {} };
  };
  const collections = indexed(content.collections.map(collection));
  const all = { handle: 'all', title: 'Semua produk', description: '', url: `${prefix}/collections/all`, image: null, products, products_count: products.length, seo: {} };
  collections.all = all;

  const blogById = new Map(content.blogs.map((b) => [b.id, b]));
  const article = (a) => {
    const blog = blogById.get(a.blog_id);
    return { id: a.id, handle: a.handle, title: a.title, url: `${prefix}/blogs/${blog?.handle}/${a.handle}`, excerpt: a.excerpt,
      image: image(a.cover), author: a.author, tags: a.tags, published_at: a.published_at, created_at: a.published_at,
      blog_handle: blog?.handle, blog_id: a.blog_id, seo: a.seo ?? {} };
  };
  const articles = content.articles.map(article);
  const blogs = indexed(content.blogs.map((b) => {
    const list = articles.filter((a) => a.blog_id === b.id);
    return { id: b.id, handle: b.handle, title: b.title, url: `${prefix}/blogs/${b.handle}`, articles: list, articles_count: list.length };
  }));
  const pages = indexed(content.pages.map((p) => ({ id: p.id, handle: p.handle, title: p.title, content: p.body, url: `${prefix}/pages/${p.handle}`, template_suffix: p.template_suffix, seo: p.seo ?? {} })));

  return { pages, products, productById, collections, blogs, articles, filesByName, image };
}

/**
 * Render satu URL situs.
 * @param query  { page, q, form: { type, ok, error } }
 * @param editor (theme editor) { view: suffix template, only: { file, sectionId }, bridge: config bridgeScript }
 * @returns {Promise<{ status: number, html?: string, location?: string, redirectId?: string }>}
 */
// forceTemplate: 'password' → halaman password/segera hadir (PRD §4.1); passwordForm = { action, error } bila pengunjung bisa masuk dengan password.
export async function renderSitePage(engine, { site, content, path, query = {}, baseUrl, design = false, headExtra = '', loaders = {}, editor = null, forceTemplate = null, passwordForm = null, themeId = null }) {
  const { locale, prefix, rest } = splitLocale(path, site);
  const tr = locale !== site.default_locale ? content.translations?.[locale] ?? {} : {};
  ({ site, content } = localize(site, content, tr));
  const body = async (kind, id) => tr[`${kind}:${id}:body`] || ((await loaders.body?.(kind, id)) ?? '');
  // Teks section theme: 'theme:<themeId>:<id section>.<setting>' → '<id section>.<setting>'.
  const themePrefix = `theme:${themeId}:`;
  const themeTr = Object.fromEntries(Object.entries(tr).filter(([k]) => k.startsWith(themePrefix)).map(([k, v]) => [k.slice(themePrefix.length), v]));
  const o = buildObjects(site, content, prefix);
  let route = forceTemplate ? { template: forceTemplate } : matchRoute(rest);
  const scope = {};

  if (route.template === 'page') {
    scope.page = o.pages[route.handle];
  } else if (route.template === 'product') {
    const p = o.products.find((x) => x.handle === route.handle);
    if (p) scope.product = { ...p, content: await body('product', p.id), related: p.related_ids.map((id) => o.productById.get(id)).filter(Boolean).slice(0, 4) };
  } else if (route.template === 'collection') {
    scope.collection = o.collections[route.handle];
  } else if (route.template === 'blog') {
    scope.blog = o.blogs[route.handle];
  } else if (route.template === 'article') {
    const blog = o.blogs[route.blog];
    const a = blog?.articles.find((x) => x.handle === route.handle);
    if (a) { scope.blog = blog; scope.article = { ...a, content: await body('article', a.id) }; }
  } else if (route.template === 'search') {
    const terms = String(query.q ?? '').trim().slice(0, 100);
    const hits = terms && loaders.search ? await loaders.search(terms) : [];
    const lookup = {
      product: (id) => { const p = o.productById.get(id); return p && { object_type: 'product', title: p.title, url: p.url, excerpt: p.summary, image: p.featured_image }; },
      article: (id) => { const a = o.articles.find((x) => x.id === id); return a && { object_type: 'article', title: a.title, url: a.url, excerpt: a.excerpt, image: a.image }; },
      page: (id) => { const p = o.pages.find((x) => x.id === id); return p && { object_type: 'page', title: p.title, url: p.url, excerpt: stripTags(p.content).slice(0, 160), image: null }; },
    };
    const results = hits.map((h) => lookup[h.type]?.(h.id)).filter(Boolean);
    scope.search = { performed: !!terms, terms, results, results_count: results.length };
  }
  const found = { page: 'page', product: 'product', collection: 'collection', blog: 'blog', article: 'article' }[route.template];
  if (found && !scope[found]) route = { template: '404' };

  // Redirect (PRD §4.5) dicek sebelum 404.
  if (route.template === '404') {
    const r = content.redirects?.find((x) => x.from_path === path || x.from_path === path.replace(/\/+$/, ''));
    if (r) return { status: 301, location: r.to_url, redirectId: r.id };
  }

  const s = site.settings ?? {};
  const main = scope.article ?? scope.product ?? scope.page ?? scope.collection ?? scope.blog;
  const canonical = baseUrl + path;
  const baseTitle = { search: 'Pencarian', 'list-collections': 'Koleksi', 404: '404' }[route.template];
  const title = main ? `${main.seo?.title || main.title} | ${site.name}` : baseTitle ? `${baseTitle} | ${site.name}` : s.seo?.title || site.name;
  const description = main?.seo?.description || main?.summary || main?.excerpt || (main?.description && stripTags(main.description)) || s.seo?.description || s.tagline || '';
  // Logo, favicon, gambar SEO disimpan sebagai id file (tahan ganti nama/pindah folder).
  const logo = o.image(s.logo_file) ?? (s.logo ? { src: s.logo } : null);
  const favicon = o.image(s.favicon_file);
  const ogImage = (main?.featured_image ?? main?.image)?.src ?? o.image(s.seo?.image_file)?.src ?? logo?.src ?? '';

  const languages = site.locales.map((iso) => ({
    iso_code: iso, name: LANG_NAMES[iso] ?? iso, root_url: iso === site.default_locale ? '/' : `/${iso}`,
    url: (iso === site.default_locale ? '' : `/${iso}`) + (rest === '/' && iso !== site.default_locale ? '' : rest) || '/',
  }));
  const hreflang = languages.length > 1
    ? languages.map((l) => `<link rel="alternate" hreflang="${l.iso_code}" href="${esc(baseUrl + l.url)}">`).join('')
    : '';

  const c = s.contact ?? {};
  const ld = [{ '@context': 'https://schema.org', '@type': c.address ? 'LocalBusiness' : 'Organization', name: site.name, url: baseUrl,
    logo: logo?.src, image: logo?.src, email: c.email || undefined, telephone: c.phone || undefined, address: c.address || undefined }];
  if (scope.product) {
    const p = scope.product;
    ld.push({ '@context': 'https://schema.org', '@type': 'Product', name: p.title, description: p.summary || stripTags(p.content).slice(0, 300),
      image: p.images.map((i) => i.src), url: baseUrl + p.url, brand: { '@type': 'Brand', name: site.name } });
  }
  if (scope.article) {
    const a = scope.article;
    ld.push({ '@context': 'https://schema.org', '@type': 'Article', headline: a.title, image: a.image?.src, datePublished: a.published_at,
      author: a.author ? { '@type': 'Person', name: a.author } : { '@type': 'Organization', name: site.name }, url: baseUrl + a.url });
  }
  if (route.template !== 'index' && route.template !== '404') {
    const crumbs = [['Beranda', prefix || '/']];
    if (scope.blog) crumbs.push([scope.blog.title, scope.blog.url]);
    if (scope.collection) crumbs.push([scope.collection.title, scope.collection.url]);
    if (main && main !== scope.blog && main !== scope.collection) crumbs.push([main.title, main.url]);
    if (!main) crumbs.push([baseTitle, rest]);
    ld.push({ '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: crumbs.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: baseUrl + url })) });
  }

  const header = [
    `<link rel="canonical" href="${esc(canonical)}">`,
    `<meta property="og:type" content="${scope.article ? 'article' : scope.product ? 'product' : 'website'}"><meta property="og:title" content="${esc(title)}"><meta property="og:url" content="${esc(canonical)}"><meta property="og:site_name" content="${esc(site.name)}">`,
    description && `<meta property="og:description" content="${esc(description)}">`,
    ogImage && `<meta property="og:image" content="${esc(ogImage)}"><meta name="twitter:card" content="summary_large_image">`,
    main?.seo?.noindex || ['404', 'search'].includes(route.template) ? '<meta name="robots" content="noindex">' : '',
    hreflang,
    ...ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, '\\u003c')}</script>`),
    favicon && `<link rel="icon" href="${esc(favicon.variants?.[400] ?? favicon.src)}">`,
    !design && integrationsHead(s.integrations, locale),
    headExtra,
    // Kode tambahan <head> dari pengaturan (owner/admin saja, tercatat di audit log).
    !design && s.head_code,
    editor?.bridge && bridgeScript(editor.bridge),
  ].filter(Boolean).join('\n');

  const currentUrl = rest === '/' ? prefix || '/' : prefix + rest;
  const linklists = Object.fromEntries(content.menus.map((m) => [m.handle, linklist(m, prefix, currentUrl)]));

  const globals = {
    site: { name: site.name, url: baseUrl, logo, favicon, tagline: s.tagline ?? '', contact: c, social: s.social ?? {}, hours: s.hours ?? '', locale },
    shop_locale: site.default_locale,
    request: { path: prefix + rest, host: new URL(baseUrl).host, locale: { iso_code: locale }, design_mode: design, page: query.page, form: query.form },
    localization: { available_languages: languages, language: languages.find((l) => l.iso_code === locale) },
    routes: { root_url: prefix || '/', search_url: `${prefix}/search`, collections_url: `${prefix}/collections`, all_products_collection_url: `${prefix}/collections/all` },
    linklists, pages: o.pages, collections: o.collections, blogs: o.blogs,
    ...scope,
    canonical_url: canonical, page_title: title, page_description: description, page_image: ogImage || null,
    content_for_header: header,
    powered_by_link: site.show_badge ? poweredByLink(site.slug) : '',
    password_form: passwordForm,
    __files: o.filesByName,
    __tr: themeTr,
    __turnstile_site_key: loaders.turnstileSiteKey ?? null,
  };

  const suffix = editor?.view || main?.template_suffix;
  if (editor?.only) return { status: 200, html: await engine.renderPage(route.template, suffix, globals, editor.only) };
  let html = await engine.renderPage(route.template, suffix, globals);
  // Badge wajib (PRD §4.11): sisipkan bila theme tidak memanggil {{ powered_by_link }}.
  if (site.show_badge && !html.includes('class="fauqa-badge"')) {
    html = html.includes('</body>') ? html.replace('</body>', `${BADGE_FALLBACK(site.slug)}</body>`) : html + BADGE_FALLBACK(site.slug);
  }
  return { status: route.template === '404' ? 404 : forceTemplate ? (passwordForm ? 401 : 503) : 200, html };
}

// sitemap.xml (PRD §4.11): semua URL published, per bahasa.
export function renderSitemap(site, content, baseUrl) {
  const o = buildObjects(site, content, '');
  const paths = ['/', ...o.pages.map((p) => p.url), '/collections', ...o.collections.map((c) => c.url), '/collections/all',
    ...o.products.map((p) => p.url), ...o.blogs.map((b) => b.url), ...o.articles.map((a) => a.url)];
  const extra = site.locales.filter((l) => l !== site.default_locale);
  const urls = paths.flatMap((p) => [p, ...extra.map((l) => `/${l}${p === '/' ? '' : p}`)]);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
    urls.map((u) => `  <url><loc>${esc(baseUrl + u)}</loc></url>`).join('\n')}\n</urlset>\n`;
}

export function renderRobots(site, baseUrl) {
  const custom = site.settings?.robots_txt;
  return (custom?.trim() ? custom.trim() : 'User-agent: *\nDisallow: /search') + `\n\nSitemap: ${baseUrl}/sitemap.xml\n`;
}
