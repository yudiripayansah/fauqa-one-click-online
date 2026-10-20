// Engine theme Liquid (PRD §6): template JSON → section (+ schema, block) → layout/theme.liquid.
// Murni: tidak membaca DB/filesystem. `files` = { 'sections/hero.liquid': '...', ... } (file teks theme).
// Dipakai route situs (lib/site/render.js) dan scripts/check-theme.mjs.
import { Liquid, Drop } from 'liquidjs';

const SCHEMA_RE = /{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/;
const MAX_SECTIONS = 25;
const MAX_BLOCKS = 50;

const escapeAttr = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// `{{ template }}` mencetak "page.about"; `template.name` / `template.suffix` juga tersedia.
class TemplateDrop extends Drop {
  constructor(name, suffix) { super(); this.name = name; this.suffix = suffix ?? null; }
  valueOf() { return this.suffix ? `${this.name}.${this.suffix}` : this.name; }
}

const readJSON = (files, key) => {
  const src = files[key];
  if (src == null) return null;
  try { return JSON.parse(src); } catch (e) { throw new Error(`${key}: JSON tidak valid (${e.message})`); }
};

export function parseSchema(source, key = 'section') {
  const m = SCHEMA_RE.exec(source);
  if (!m) return {};
  try { return JSON.parse(m[1]); } catch (e) { throw new Error(`${key}: {% schema %} bukan JSON valid (${e.message})`); }
}

// Nilai default dari daftar setting schema, ditimpa nilai yang tersimpan.
const withDefaults = (defs = [], values = {}) => {
  const out = {};
  for (const d of defs) if (d.id) out[d.id] = d.default ?? null;
  return { ...out, ...values };
};

const lookup = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

/**
 * Buat engine untuk satu versi theme. Simpan & pakai ulang hasilnya (parse template di-cache di dalamnya).
 * @param {Record<string,string>} files  file teks theme
 * @param {{ assetBase: string, assetUrls?: Record<string,string> }} opts  URL dasar aset teks theme, mis. `/theme-assets/<id>/<version>/`;
 *   assetUrls = URL Storage untuk aset biner ('assets/logo.png' → https://…).
 */
export function createThemeEngine(files, { assetBase, assetUrls = {} }) {
  const snippets = {};
  for (const [k, v] of Object.entries(files)) if (k.startsWith('snippets/') && k.endsWith('.liquid')) snippets[k.slice(9)] = v;

  const liquid = new Liquid({
    templates: snippets,          // {% render 'x' %} → snippets/x.liquid (memori, tanpa filesystem)
    extname: '.liquid',
    cache: true,
    ownPropertyOnly: true,
    strictFilters: false,
    parseLimit: 1e6,
    renderLimit: 500,             // ms per render (PRD §6.7)
    memoryLimit: 64e6,
  });

  const parsed = new Map();       // key → { tpls, schema }
  function load(key) {
    if (!parsed.has(key)) {
      const src = files[key];
      if (src == null) throw new Error(`File theme tidak ada: ${key}`);
      parsed.set(key, { tpls: liquid.parse(src.replace(SCHEMA_RE, ''), key), schema: key.startsWith('sections/') ? parseSchema(src, key) : null });
    }
    return parsed.get(key);
  }

  const locales = {};
  for (const [k, v] of Object.entries(files)) {
    const m = /^locales\/([a-z]{2})(\.default)?\.json$/.exec(k);
    if (m) locales[m[1]] = readJSON(files, k);
  }

  // ---------- filter
  const assetUrl = (name) => assetUrls[`assets/${name}`] ?? assetBase + encodeURI(String(name));
  liquid.registerFilter('asset_url', assetUrl);
  liquid.registerFilter('stylesheet_tag', (url) => `<link rel="stylesheet" href="${escapeAttr(url)}" media="all">`);
  liquid.registerFilter('script_tag', (url) => `<script src="${escapeAttr(url)}" defer></script>`);
  liquid.registerFilter('handleize', (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
  liquid.registerFilter('link_to', (text, url, title) => `<a href="${escapeAttr(url)}"${title ? ` title="${escapeAttr(title)}"` : ''}>${text}</a>`);
  // Gambar: objek image ({ src, alt, width, height, variants: { 400: url, ... } }), nama file di file manager
  // ('files/logo.png' / 'logo.png'), atau URL. image_url memilih varian WebP terkecil yang ≥ width.
  const toImage = (g, v) => {
    if (v && typeof v === 'object') return v;
    if (typeof v !== 'string' || !v) return null;
    if (/^(https?:)?\/\//.test(v) || v.startsWith('/')) return { src: v };
    return g.__files?.[v.replace(/^files\//, '')] ?? { src: v };
  };
  const pickVariant = (img, width) => {
    const ws = Object.keys(img.variants ?? {}).map(Number).sort((a, b) => a - b);
    if (!ws.length || !width) return img.src;
    return img.variants[ws.find((w) => w >= width) ?? ws.at(-1)];
  };
  liquid.registerFilter('image_url', function (v, ...args) {
    const img = toImage(this.context.globals, v);
    if (!img) return '';
    const { width } = Object.fromEntries(args.filter(Array.isArray));
    // Hasil berupa string yang membawa objek asal, agar `| image_tag` masih bisa membuat srcset.
    const url = new String(pickVariant(img, Number(width) || 0));
    url.__image = img;
    return url;
  });
  liquid.registerFilter('file_url', function (name) {
    const f = this.context.globals.__files?.[String(name ?? '').replace(/^files\//, '')];
    return f ? f.src : '';
  });
  liquid.registerFilter('image_tag', function (url, ...args) {
    const img = url?.__image ?? toImage(this.context.globals, typeof url === 'object' && !(url instanceof String) ? url : String(url ?? ''));
    const attrs = Object.fromEntries(args.filter(Array.isArray));
    const alt = attrs.alt ?? img?.alt ?? '';
    delete attrs.alt;
    const base = { loading: 'lazy', width: img?.width, height: img?.height };
    const ws = Object.keys(img?.variants ?? {}).map(Number).sort((a, b) => a - b);
    if (ws.length > 1) {
      base.srcset = ws.map((w) => `${img.variants[w]} ${w}w`).join(', ');
      base.sizes = attrs.sizes ?? '100vw';
    }
    const extra = Object.entries({ ...base, ...attrs }).filter(([, v]) => v != null && v !== '').map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
    return `<img src="${escapeAttr(String(url ?? img?.src ?? ''))}" alt="${escapeAttr(alt)}"${extra}>`;
  });
  // Harga tampil berupa teks bebas ("Mulai Rp 5 jt"), tidak diformat ulang.
  liquid.registerFilter('money', (v) => v ?? '');
  // Nama bulan/hari mengikuti bahasa halaman (strftime bawaan LiquidJS berbahasa Inggris).
  const builtinDate = liquid.filters.date;
  liquid.registerFilter('date', function (v, fmt, ...rest) {
    if (!fmt || !/%[aAbB]/.test(fmt)) return builtinDate.call(this, v, fmt, ...rest);
    const d = v === 'now' || v === 'today' ? new Date() : new Date(v);
    if (Number.isNaN(d.getTime())) return v;
    const loc = this.context.globals.request?.locale?.iso_code ?? 'id';
    const name = (opt) => new Intl.DateTimeFormat(loc, opt).format(d);
    const f = fmt.replace(/%B/g, name({ month: 'long' })).replace(/%b/g, name({ month: 'short' }))
      .replace(/%A/g, name({ weekday: 'long' })).replace(/%a/g, name({ weekday: 'short' }));
    return builtinDate.call(this, d, f, ...rest);
  });
  // {{ paginate | default_pagination }}
  liquid.registerFilter('default_pagination', (p) => {
    if (!p || p.pages <= 1) return '';
    const link = (n, label, rel) => `<a href="${escapeAttr(p.url_for(n))}"${rel ? ` rel="${rel}"` : ''}>${label}</a>`;
    const parts = [];
    if (p.previous) parts.push(link(p.current_page - 1, '&larr;', 'prev'));
    for (let n = 1; n <= p.pages; n++) parts.push(n === p.current_page ? `<span aria-current="page">${n}</span>` : link(n, n));
    if (p.next) parts.push(link(p.current_page + 1, '&rarr;', 'next'));
    return `<nav class="pagination" aria-label="Halaman">${parts.join(' ')}</nav>`;
  });
  liquid.registerFilter('placeholder_svg_tag', (name, cls) =>
    `<svg class="${escapeAttr(cls ?? 'placeholder-svg')}" viewBox="0 0 525 300" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${escapeAttr(name)}"><rect width="525" height="300" fill="currentColor" opacity=".08"/><path d="M0 300 190 120l90 90 70-60 175 150Z" fill="currentColor" opacity=".12"/><circle cx="400" cy="80" r="34" fill="currentColor" opacity=".12"/></svg>`);
  // {{ 'general.contact' | t }}, {{ 'x' | t: name: 'Budi' }} → "{{ name }}" diganti.
  liquid.registerFilter('t', function (key, ...args) {
    const g = this.context.globals;
    const val = lookup(locales[g.request?.locale?.iso_code] ?? {}, key) ?? lookup(locales[g.shop_locale] ?? {}, key);
    if (typeof val !== 'string') return key;
    const vars = Object.fromEntries(args.filter(Array.isArray));
    return val.replace(/{{\s*(\w+)\s*}}/g, (_, k) => vars[k] ?? '');
  });

  // ---------- tag
  // {% style %}…{% endstyle %} (+ stylesheet/javascript): isi di-render lalu dibungkus.
  const wrapTag = (name, open, close) => liquid.registerTag(name, {
    parse(token, remain) {
      this.tpls = [];
      const stream = this.liquid.parser.parseStream(remain);
      stream.on(`tag:end${name}`, () => stream.stop())
        .on('template', (t) => this.tpls.push(t))
        .on('end', () => { throw new Error(`tag ${token.getText()} tidak ditutup`); });
      stream.start();
    },
    *render(ctx, emitter) {
      const html = yield this.liquid.renderer.renderTemplates(this.tpls, ctx);
      emitter.write(open + html + close);
    },
  });
  wrapTag('style', '<style>', '</style>');
  wrapTag('stylesheet', '<style>', '</style>');
  wrapTag('javascript', '<script>', '</script>');

  // Ambil blok template sampai {% end<name> %}.
  const parseBlock = (tag, token, remain) => {
    tag.tpls = [];
    const stream = tag.liquid.parser.parseStream(remain);
    stream.on(`tag:end${token.name}`, () => stream.stop())
      .on('template', (t) => tag.tpls.push(t))
      .on('end', () => { throw new Error(`tag ${token.getText()} tidak ditutup`); });
    stream.start();
  };

  // {% form 'contact' %} · {% form 'inquiry', product %} · {% form 'newsletter' %} (PRD §4.7).
  // Di dalam blok: form.posted_successfully, form.errors. Field: contact[name], contact[email], contact[body], contact[<apa saja>].
  liquid.registerTag('form', {
    parse(token, remain) {
      const [type, arg] = token.args.split(',').map((s) => s.trim());
      this.type = type.replace(/^['"]|['"]$/g, '');
      this.arg = arg;
      if (!['contact', 'inquiry', 'newsletter'].includes(this.type)) throw new Error(`Tipe form tidak dikenal: ${this.type}`);
      parseBlock(this, token, remain);
    },
    *render(ctx, emitter) {
      const g = ctx.globals;
      const product = this.arg ? yield this.liquid.evalValue(this.arg, ctx) : null;
      const status = g.request?.form ?? {};
      const mine = status.type === this.type;
      const form = { type: this.type, posted_successfully: mine && status.ok === true, errors: mine && status.error ? [status.error] : [] };
      ctx.push({ form });
      const body = yield this.liquid.renderer.renderTemplates(this.tpls, ctx);
      ctx.pop();
      const hidden = [
        ['form_type', this.type], ['return_to', g.request?.path ?? '/'], ['locale', g.request?.locale?.iso_code ?? ''],
        product?.id ? ['product_id', product.id] : null,
      ].filter(Boolean).map(([n, v]) => `<input type="hidden" name="${n}" value="${escapeAttr(v)}">`).join('');
      // Honeypot (disembunyikan dari manusia & pembaca layar) + Cloudflare Turnstile bila dikonfigurasi.
      const trap = '<div aria-hidden="true" style="position:absolute;left:-9999px"><label>Website<input type="text" name="contact[website]" tabindex="-1" autocomplete="off"></label></div>';
      const turnstile = g.__turnstile_site_key
        ? `<div class="cf-turnstile" data-sitekey="${escapeAttr(g.__turnstile_site_key)}" data-size="flexible"></div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
        : '';
      emitter.write(`<form method="post" action="${escapeAttr((g.routes?.root_url === '/' ? '' : g.routes?.root_url ?? '') + '/contact')}" id="${this.type}_form" class="fauqa-form" accept-charset="UTF-8">${hidden}${trap}${body}${turnstile}</form>`);
    },
  });

  // {% paginate collection.products by 12 %} … {{ paginate | default_pagination }} {% endpaginate %}
  // Halaman aktif dari ?page=. Array di dalam blok diganti dengan potongan halaman itu.
  liquid.registerTag('paginate', {
    parse(token, remain) {
      const m = /^\s*([\w.]+)\s+by\s+([\w.]+)\s*$/.exec(token.args);
      if (!m) throw new Error(`paginate: format "{% paginate <array> by <n> %}"`);
      this.path = m[1].split('.');
      this.by = m[2];
      parseBlock(this, token, remain);
    },
    *render(ctx, emitter) {
      const g = ctx.globals;
      const size = Math.min(Math.max(Number(yield this.liquid.evalValue(this.by, ctx)) || 12, 1), 50);
      const root = yield this.liquid.evalValue(this.path[0], ctx);
      const all = this.path.slice(1).reduce((o, k) => o?.[k], root) ?? [];
      const pages = Math.max(1, Math.ceil(all.length / size));
      const current = Math.min(Math.max(1, Number(g.request?.page) || 1), pages);
      const items = all.slice((current - 1) * size, current * size);
      const base = g.request?.path ?? '/';
      const paginate = {
        current_page: current, pages, items: all.length, page_size: size,
        previous: current > 1, next: current < pages,
        url_for: (n) => (n === 1 ? base : `${base}?page=${n}`),
      };
      // Salin dangkal sepanjang path agar data asli (cache) tidak berubah.
      const replaced = this.path.length === 1 ? items
        : (function set(obj, keys) { return keys.length === 1 ? { ...obj, [keys[0]]: items } : { ...obj, [keys[0]]: set(obj[keys[0]], keys.slice(1)) }; })(root, this.path.slice(1));
      ctx.push({ paginate, [this.path[0]]: replaced });
      emitter.write(yield this.liquid.renderer.renderTemplates(this.tpls, ctx));
      ctx.pop();
    },
  });

  // {% section 'header' %}: section statis, setting dari settings_data.json → current.sections.<nama>.
  liquid.registerTag('section', {
    parse(token) { this.name = token.args.trim().replace(/^['"]|['"]$/g, ''); },
    *render(ctx, emitter) {
      const cur = ctx.globals.__settings_data?.current;
      const saved = (typeof cur === 'object' && cur?.sections?.[this.name]) || {};
      emitter.write(yield renderSection(this.name, { type: this.name, ...saved }, ctx.globals, 0));
    },
  });
  // {% sections 'header-group' %}: section group dari sections/<nama>.json.
  liquid.registerTag('sections', {
    parse(token) { this.name = token.args.trim().replace(/^['"]|['"]$/g, ''); },
    *render(ctx, emitter) {
      const data = readJSON(files, `sections/${this.name}.json`);
      if (data) emitter.write(yield renderSectionList(data, this.name, ctx.globals));
    },
  });

  // ---------- section
  async function renderSection(id, data, globals, index) {
    const key = `sections/${data.type}.liquid`;
    if (files[key] == null) return `<!-- section ${escapeAttr(data.type)} tidak ditemukan -->`;
    const { tpls, schema } = load(key);
    const design = globals.request?.design_mode;
    const blockDefs = Object.fromEntries((schema.blocks ?? []).map((b) => [b.type, b]));
    // Terjemahan teks section (bahasa kedua): globals.__tr['<id>.<setting>'] / ['<id>.<block>.<setting>'].
    const tr = globals.__tr ?? {};
    const trOf = (base, values = {}) => Object.fromEntries(Object.entries(values).map(([k, v]) => [k, tr[`${base}.${k}`] || v]));
    if (Object.keys(tr).length) {
      data = { ...data, settings: trOf(id, data.settings),
        blocks: Object.fromEntries(Object.entries(data.blocks ?? {}).map(([bid, b]) => [bid, { ...b, settings: trOf(`${id}.${bid}`, b.settings) }])) };
    }
    const order = (data.block_order ?? Object.keys(data.blocks ?? {})).slice(0, MAX_BLOCKS);
    const blocks = order
      .map((bid) => [bid, data.blocks?.[bid]])
      .filter(([, b]) => b && !b.disabled && blockDefs[b.type])
      .map(([bid, b]) => {
        const attrs = design ? `data-fauqa-block="${escapeAttr(bid)}" data-fauqa-section="${escapeAttr(id)}"` : '';
        return { id: bid, type: b.type, settings: withDefaults(blockDefs[b.type].settings, b.settings), fauqa_attributes: attrs, shopify_attributes: attrs };
      });
    const section = {
      id, type: data.type, index, blocks,
      settings: await renderLiquidSettings(schema.settings, withDefaults(schema.settings, data.settings), globals),
      fauqa_attributes: design ? `data-fauqa-section="${escapeAttr(id)}"` : '',
    };
    let html;
    try {
      html = await liquid.render(tpls, { section }, { globals });
    } catch (e) {
      // Satu section rusak tidak menjatuhkan seluruh halaman.
      html = design ? `<div class="fauqa-error" style="padding:1rem;background:#fee;color:#900;font:14px monospace">${escapeAttr(e.message)}</div>` : '';
      console.error(`[theme] ${key}:`, e.message);
    }
    const tag = /^[a-z]+$/.test(schema.tag ?? '') ? schema.tag : 'div';
    return `<${tag} id="fauqa-section-${escapeAttr(id)}" class="fauqa-section${schema.class ? ' ' + escapeAttr(schema.class) : ''}">${html}</${tag}>`;
  }

  // Setting bertipe `liquid` (mis. section Custom Liquid) dirender sebagai Liquid, seperti di Shopify.
  async function renderLiquidSettings(defs = [], settings, globals) {
    for (const d of defs) {
      if (d.type !== 'liquid' || typeof settings[d.id] !== 'string' || !settings[d.id]) continue;
      try { settings[d.id] = await liquid.parseAndRender(settings[d.id], {}, { globals }); }
      catch (e) { settings[d.id] = globals.request?.design_mode ? `<pre style="color:#900">${escapeAttr(e.message)}</pre>` : ''; }
    }
    return settings;
  }

  async function renderSectionList(data, prefix, globals) {
    const order = (data.order ?? Object.keys(data.sections ?? {})).slice(0, MAX_SECTIONS);
    const parts = [];
    for (const [i, sid] of order.entries()) {
      const s = data.sections?.[sid];
      if (!s || s.disabled) continue;
      parts.push(await renderSection(`${prefix}__${sid}`, s, globals, i + 1));
    }
    return parts.join('\n');
  }

  /**
   * Render halaman penuh.
   * @param {string} template  'index' | 'page' | '404' | ...
   * @param {string|null} suffix  template alternatif (page.<suffix>)
   * @param {object} globals  objek Liquid global (site, request, page, linklists, ...)
   * @param {{ file: string, sectionId: string }} [only]  Section Rendering API: hanya satu section,
   *   dari template halaman ini (file 'template') atau section group (file 'sections/header-group.json').
   */
  async function renderPage(template, suffix, globals, only) {
    const key = suffix && files[`templates/${template}.${suffix}.json`] ? `templates/${template}.${suffix}.json` : `templates/${template}.json`;
    const data = readJSON(files, key);
    if (!data) throw new Error(`Template tidak ada: ${key}`);

    const settingsData = readJSON(files, 'config/settings_data.json') ?? {};
    const settingsSchema = readJSON(files, 'config/settings_schema.json') ?? [];
    // Seperti Shopify: `current` berisi nilai, atau nama salah satu `presets`.
    const current = typeof settingsData.current === 'string' ? settingsData.presets?.[settingsData.current] : settingsData.current;
    const settings = withDefaults(settingsSchema.flatMap((g) => g.settings ?? []), current ?? {});
    const full = {
      ...globals,
      settings,
      template: new TemplateDrop(template, suffix && key.includes(`.${suffix}.`) ? suffix : null),
      __settings_data: settingsData,
    };
    if (only) {
      const group = only.file === 'template' ? null : /^sections\/([a-z0-9_-]+)\.json$/.exec(only.file)?.[1];
      const list = group ? readJSON(files, only.file) : data;
      const s = list?.sections?.[only.sectionId];
      if (!s) return '';
      const index = (list.order ?? Object.keys(list.sections)).indexOf(only.sectionId) + 1;
      return renderSection(`${group ?? `template--${template}`}__${only.sectionId}`, s, full, index);
    }
    full.content_for_layout = await renderSectionList(data, `template--${template}`, full);
    const layout = data.layout === false ? null : `layout/${data.layout ?? 'theme'}.liquid`;
    if (!layout) return full.content_for_layout;
    return liquid.render(load(layout).tpls, {}, { globals: full });
  }

  return { renderPage, liquid };
}
