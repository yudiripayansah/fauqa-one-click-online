// Dokumentasi developer theme (PRD §6.5). Publik di <domain induk>/docs/theme.
import { APP_URL } from '@/lib/hosts';
import { Brand } from '@/components/admin/AuthShell';

export const metadata = {
  title: { absolute: 'Dokumentasi theme · Fauqa One Click' },
  description: 'Panduan membuat theme Fauqa One Click: struktur folder, template JSON, section dan schema, objek, tag, dan filter Liquid.',
  robots: { index: true, follow: true },
};

const Code = ({ children }) => (
  <pre className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface p-4 font-mono text-[13px] leading-relaxed"><code>{children.trim()}</code></pre>
);
const C = ({ children }) => <code className="rounded bg-line/60 px-1 py-0.5 font-mono text-[0.9em]">{children}</code>;
const Table = ({ head, rows }) => (
  <div className="mt-4 overflow-x-auto">
    <table className="w-full border-collapse text-left text-sm">
      <thead><tr>{head.map((h) => <th key={h} className="border-b border-line py-2 pr-4 font-semibold">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} className="border-b border-line py-2 pr-4 align-top">{i === 0 ? <C>{c}</C> : c}</td>)}</tr>)}</tbody>
    </table>
  </div>
);

const TOC = [
  ['ringkasan', 'Ringkasan'], ['struktur', 'Struktur folder'], ['layout', 'Layout'], ['template', 'Template JSON'],
  ['section', 'Section & schema'], ['setting', 'Tipe setting'], ['objek', 'Objek'], ['tag-filter', 'Tag & filter'],
  ['form', 'Form'], ['bahasa', 'Bahasa'], ['editor', 'Theme editor'], ['validasi', 'Validasi & batas'], ['shopify', 'Porting dari Shopify'],
];

const H2 = ({ id, children }) => <h2 id={id} className="scroll-mt-6 border-t border-line pt-10 text-2xl font-extrabold tracking-tight">{children}</h2>;

export default function ThemeDocs() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- '/' di domain induk di-rewrite proxy ke /landing */}
          <a href="/" aria-label="Fauqa One Click, beranda"><Brand /></a>
          <a href={`${APP_URL}/login`} className="text-sm font-medium text-muted hover:text-ink">Masuk</a>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="Isi dokumentasi" className="text-sm lg:sticky lg:top-6 lg:self-start">
          <ol className="flex flex-wrap gap-x-4 gap-y-1 lg:block lg:space-y-1.5">
            {TOC.map(([id, label]) => <li key={id}><a href={`#${id}`} className="text-muted hover:text-ink">{label}</a></li>)}
          </ol>
        </nav>

        <article className="max-w-3xl space-y-5 leading-relaxed [&_p]:text-[15px] [&_li]:text-[15px]">
          <h1 className="text-4xl font-extrabold tracking-tight">Dokumentasi theme</h1>

          <H2 id="ringkasan">Ringkasan</H2>
          <p>Theme Fauqa One Click memakai <b>Liquid</b> dan meniru Shopify Online Store 2.0: template JSON berisi daftar section, setiap section membawa <C>{'{% schema %}'}</C> sendiri, dan section group untuk header/footer. Developer theme Shopify bisa langsung bekerja; bedanya ada pada objek e-commerce yang tidak tersedia (lihat <a href="#shopify" className="text-accent underline">Porting dari Shopify</a>).</p>
          <p>Theme bisa diedit langsung di browser (Theme → Edit code), atau diunduh sebagai .zip, diubah di komputer, lalu diunggah lagi. Setiap simpan dan unggah divalidasi; file yang gagal validasi tidak pernah menggantikan file yang sedang tayang.</p>

          <H2 id="struktur">Struktur folder</H2>
          <Code>{`
layout/
  theme.liquid            wajib. Kerangka HTML
  password.liquid         opsional. Halaman password / segera hadir
templates/                JSON: daftar & urutan section per tipe halaman
  index.json              wajib
  page.json               wajib
  page.contact.json       template alternatif (suffix "contact")
  product.json  collection.json  list-collections.json
  blog.json  article.json  search.json  404.json  password.json
sections/
  header-group.json       section group
  footer-group.json
  hero.liquid             HTML Liquid + {% schema %}
snippets/                 {% render 'card-product', product: p %}
assets/                   css, js, svg, gambar, font → {{ 'base.css' | asset_url }}
config/
  settings_schema.json    wajib. Definisi theme settings
  settings_data.json      nilai theme settings + preset gaya
locales/
  id.default.json  en.json    string untuk filter t
`}</Code>
          <p>Belum didukung: folder <C>blocks/</C> (theme blocks) dan nested blocks. Block didefinisikan di schema section, seperti OS 2.0 awal.</p>

          <H2 id="layout">Layout</H2>
          <p><C>layout/theme.liquid</C> wajib memanggil <C>{'{{ content_for_header }}'}</C> di <C>{'<head>'}</C> (SEO, canonical, hreflang, data terstruktur, kode tambahan pemilik situs) dan <C>{'{{ content_for_layout }}'}</C> di tempat isi halaman. Badge <C>{'{{ powered_by_link }}'}</C> wajib tampil; bila theme tidak memanggilnya, badge disisipkan otomatis sebelum <C>{'</body>'}</C>.</p>
          <Code>{`
<!doctype html>
<html lang="{{ request.locale.iso_code }}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ page_title }}</title>
  <meta name="description" content="{{ page_description | escape }}">
  {{ 'base.css' | asset_url | stylesheet_tag }}
  {{ content_for_header }}
</head>
<body>
  {% sections 'header-group' %}
  <main id="main">{{ content_for_layout }}</main>
  {% sections 'footer-group' %}
  {{ powered_by_link }}
</body>
</html>
`}</Code>

          <H2 id="template">Template JSON</H2>
          <p>Template berisi section beserta nilai setting-nya. Urutan tampil mengikuti <C>order</C>; block mengikuti <C>block_order</C>. Section dengan <C>{'"disabled": true'}</C> tidak dirender. Template alternatif memakai suffix (<C>page.contact.json</C>) dan dipilih per halaman/produk di admin.</p>
          <Code>{`
{
  "sections": {
    "hero": {
      "type": "hero",
      "settings": { "heading": "Solusi baja untuk industri", "height": "large" },
      "blocks": {
        "btn-1": { "type": "button", "settings": { "label": "Lihat produk", "link": "/collections/all" } }
      },
      "block_order": ["btn-1"]
    },
    "clients": { "type": "logo-list", "disabled": false, "settings": {} }
  },
  "order": ["hero", "clients"]
}
`}</Code>
          <p>Maksimal 25 section per template dan 50 block per section.</p>

          <H2 id="section">Section & schema</H2>
          <p>Pasang <C>{'{{ section.fauqa_attributes }}'}</C> di elemen terluar section dan <C>{'{{ block.fauqa_attributes }}'}</C> di setiap block, agar klik di pratinjau editor memilih section/block yang tepat. Alias <C>shopify_attributes</C> juga tersedia.</p>
          <Code>{`
<section class="hero hero--{{ section.settings.height }}" {{ section.fauqa_attributes }}>
  <h1>{{ section.settings.heading }}</h1>
  {% for block in section.blocks %}
    {% case block.type %}
      {% when 'button' %}
        <a href="{{ block.settings.link }}" class="btn" {{ block.fauqa_attributes }}>{{ block.settings.label }}</a>
    {% endcase %}
  {% endfor %}
</section>

{% schema %}
{
  "name": "Hero",
  "class": "section-hero",
  "settings": [
    { "type": "text", "id": "heading", "label": "Judul", "default": "Judul" },
    { "type": "select", "id": "height", "label": "Tinggi", "default": "large",
      "options": [{ "value": "small", "label": "Kecil" }, { "value": "large", "label": "Besar" }] }
  ],
  "blocks": [
    { "type": "button", "name": "Tombol", "limit": 2,
      "settings": [{ "type": "text", "id": "label", "label": "Teks" }, { "type": "url", "id": "link", "label": "Link" }] }
  ],
  "max_blocks": 4,
  "presets": [{ "name": "Hero", "blocks": [{ "type": "button" }] }],
  "enabled_on": { "templates": ["index", "page"] }
}
{% endschema %}
`}</Code>
          <ul className="list-disc space-y-1 pl-5">
            <li><C>presets</C>: section muncul di daftar &ldquo;Tambah section&rdquo; editor. Tanpa preset, section hanya bisa dipakai dari template JSON.</li>
            <li><C>limit</C> (per tipe block), <C>max_blocks</C>, <C>enabled_on</C> / <C>disabled_on</C> dihormati editor.</li>
            <li><C>class</C> ditambahkan ke pembungkus <C>{'<div id="fauqa-section-<id>" class="fauqa-section">'}</C>; <C>tag</C> mengganti elemen pembungkusnya.</li>
            <li>Section statis: <C>{"{% section 'header' %}"}</C>, nilainya di <C>settings_data.json → current.sections.header</C>. Section group: <C>{"{% sections 'header-group' %}"}</C> membaca <C>sections/header-group.json</C>.</li>
          </ul>

          <H2 id="setting">Tipe setting</H2>
          <Table head={['Tipe', 'Keterangan']} rows={[
            ['text, textarea', 'Teks satu baris / beberapa baris'],
            ['richtext, inline_richtext', 'HTML terbatas dari editor teks; disanitasi'],
            ['html, liquid', 'Hanya owner/admin. liquid dirender sebagai Liquid'],
            ['number, range', 'range wajib min, max, step'],
            ['checkbox, select, radio', 'select/radio wajib options'],
            ['color, color_background, color_scheme', 'Warna, gradien, skema dari theme settings'],
            ['image_picker, video, video_url', 'Dari file manager; video_url YouTube/Vimeo'],
            ['url, page, product, product_list, collection, collection_list, blog, article, link_list', 'Link dan referensi konten'],
            ['font_picker', 'Google Fonts terkurasi'],
            ['header, paragraph', 'Penanda di panel editor, tanpa nilai'],
          ]} />

          <H2 id="objek">Objek</H2>
          <Table head={['Objek', 'Isi']} rows={[
            ['site', 'name, url, logo, favicon, tagline, contact (email, phone, whatsapp, address), social, hours, locale'],
            ['settings', 'Theme settings dari settings_data.json (preset aktif atau current)'],
            ['request', 'path, host, locale.iso_code, design_mode (true di editor), page'],
            ['localization', 'available_languages[] (iso_code, name, url, root_url), language'],
            ['routes', 'root_url, search_url, collections_url, all_products_collection_url'],
            ['linklists', "linklists['main-menu'].links[] → title, url, current, child_active, links"],
            ['pages, collections, blogs', "Bisa di-loop atau diakses per handle: collections['atap']"],
            ['page', 'title, content, url, handle, template_suffix, seo'],
            ['product', 'title, summary, content, url, images, featured_image, specs[] (label, value), price_label, tags, downloads[], cta (type, label, url), related[]'],
            ['collection', 'title, description, url, image, products[], products_count'],
            ['blog / article', 'blog: title, url, articles[]; article: title, excerpt, content, image, author, tags, published_at, url'],
            ['search', 'performed, terms, results[] (object_type, title, url, excerpt, image), results_count'],
            ['section / block', 'id, type, settings, blocks, index, fauqa_attributes'],
            ['template', 'name, suffix'],
            ['page_title, page_description, page_image, canonical_url', 'Untuk tag meta'],
          ]} />
          <p>Harga hanya tampilan (<C>price_label</C>, mis. &ldquo;Mulai Rp 85.000&rdquo;); tidak ada keranjang atau checkout.</p>

          <H2 id="tag-filter">Tag & filter</H2>
          <p><b>Tag:</b> semua tag standar LiquidJS (<C>if</C>, <C>for</C>, <C>case</C>, <C>assign</C>, <C>capture</C>, <C>render</C>, <C>raw</C>, <C>liquid</C>, <C>echo</C>, …) ditambah <C>section</C>, <C>sections</C>, <C>schema</C>, <C>form</C>, <C>paginate</C>, <C>style</C>, <C>stylesheet</C>, <C>javascript</C>.</p>
          <Table head={['Filter', 'Contoh']} rows={[
            ['asset_url', "{{ 'base.css' | asset_url | stylesheet_tag }}, {{ 'theme.js' | asset_url | script_tag }}"],
            ['image_url, image_tag', "{{ product.featured_image | image_url: width: 800 | image_tag: loading: 'lazy' }} → WebP + srcset"],
            ['file_url', "{{ 'hero.jpg' | file_url }}: file dari file manager situs"],
            ['t', "{{ 'contact.send' | t }}: string dari locales/<bahasa>.json"],
            ['date', "{{ article.published_at | date: '%d %B %Y' }}: nama bulan sesuai bahasa"],
            ['money', '{{ product.price_label | money }}: label harga apa adanya'],
            ['link_to, handleize', "{{ 'Tentang' | link_to: '/pages/tentang-kami' }}"],
            ['default_pagination', '{{ paginate | default_pagination }}'],
            ['placeholder_svg_tag', "{{ 'image' | placeholder_svg_tag: 'placeholder' }}"],
          ]} />
          <Code>{`
{% paginate collection.products by 12 %}
  {% for product in collection.products %}
    {% render 'card-product', product: product %}
  {% endfor %}
  {{ paginate | default_pagination }}
{% endpaginate %}
`}</Code>

          <H2 id="form">Form</H2>
          <p><C>{"{% form 'contact' %}"}</C> membuat <C>{'<form method="post" action="/contact">'}</C> lengkap dengan field tersembunyi, honeypot anti-spam, dan Cloudflare Turnstile bila aktif. Tipe: <C>contact</C>, <C>inquiry</C> (minta penawaran; berikan produk sebagai argumen), <C>newsletter</C>. Kiriman masuk ke inbox Form di admin dan email pemilik situs.</p>
          <Code>{`
{% form 'inquiry', product %}
  {% if form.posted_successfully %}
    <p role="status">{{ 'contact.success' | t }}</p>
  {% else %}
    {% if form.errors.size > 0 %}<p role="alert">{{ form.errors | join: ' ' }}</p>{% endif %}
    <input type="text" name="contact[name]" required>
    <input type="email" name="contact[email]" required>
    <input type="tel" name="contact[phone]">
    <textarea name="contact[body]" required></textarea>
    <button type="submit">{{ 'contact.send' | t }}</button>
  {% endif %}
{% endform %}
`}</Code>
          <p>Jangan membuat field password atau data kartu: validator memberi peringatan karena form seperti itu di situs company bisa dianggap phishing.</p>

          <H2 id="bahasa">Bahasa</H2>
          <p>Situs bisa punya dua bahasa (Indonesia dan English). Bahasa kedua tampil di <C>/en/…</C> (atau <C>/id/…</C>). String theme ada di <C>locales/id.default.json</C> dan <C>locales/en.json</C>, dipanggil dengan filter <C>t</C>; kunci yang tidak ada di bahasa aktif diambil dari bahasa utama situs. Konten dan teks section diterjemahkan pemilik situs di menu Terjemahan, jadi theme tidak perlu menangani apa pun: <C>section.settings</C> sudah berisi teks bahasa aktif. Link internal di menu otomatis diberi awalan bahasa; untuk link lain pakai <C>routes.root_url</C>.</p>
          <Code>{`
{% for language in localization.available_languages %}
  <a href="{{ language.url }}" {% if language.iso_code == request.locale.iso_code %}aria-current="true"{% endif %}>
    {{ language.iso_code | upcase }}
  </a>
{% endfor %}
`}</Code>

          <H2 id="editor">Theme editor</H2>
          <p>Di editor, situs dirender dengan <C>request.design_mode = true</C> dan perubahan setting dirender ulang per section (Section Rendering API). JavaScript section yang memasang event listener atau slider harus mendengarkan event berikut agar tetap bekerja setelah dirender ulang:</p>
          <Table head={['Event', 'Kapan']} rows={[
            ['fauqa:section:load', 'Section baru dirender ulang / ditambahkan'],
            ['fauqa:section:unload', 'Section akan diganti / dihapus'],
            ['fauqa:section:select, fauqa:section:deselect', 'Section dipilih di panel editor'],
            ['fauqa:block:select, fauqa:block:deselect', 'Block dipilih (mis. buka slide yang sesuai)'],
          ]} />
          <Code>{`
document.addEventListener('fauqa:section:load', (e) => initSlider(e.target));
document.addEventListener('fauqa:block:select', (e) => goToSlide(e.target));
`}</Code>
          <p><C>event.detail</C> berisi <C>sectionId</C> dan, untuk block, <C>blockId</C>. Kode tambahan <C>{'<head>'}</C> pemilik situs tidak dijalankan di editor.</p>

          <H2 id="validasi">Validasi & batas</H2>
          <ul className="list-disc space-y-1 pl-5">
            <li>ZIP maksimal 50 MB dan 1.000 file; hanya folder di atas. Folder pembungkus (mis. <C>my-theme/</C>) dibuang otomatis.</li>
            <li>Wajib ada <C>layout/theme.liquid</C>, <C>templates/index.json</C>, <C>templates/page.json</C>, <C>config/settings_schema.json</C>.</li>
            <li>Setiap <C>.liquid</C> di-parse, setiap JSON dan <C>{'{% schema %}'}</C> dicek; laporan error menyebut file dan baris. Section yang dipakai template harus ada.</li>
            <li>Nama file: huruf kecil, angka, <C>_</C>, <C>-</C>. Ekstensi aset: css, js, json, svg, png, jpg, webp, gif, ico, woff, woff2, ttf, otf (maks. 5 MB per aset).</li>
            <li>Render dibatasi ±500 ms per template dan tanpa akses jaringan atau file: template hanya membaca objek di atas. Section yang error tidak menjatuhkan halaman (di editor, pesan error tampil di tempatnya).</li>
            <li>JavaScript theme berjalan di domain situs, terpisah dari admin.</li>
          </ul>

          <H2 id="shopify">Porting dari Shopify</H2>
          <p>Struktur folder, template JSON, schema, section group, <C>render</C>, <C>t</C>, <C>asset_url</C>, dan <C>form</C> sama. Yang perlu diubah:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Hapus <C>cart</C>, <C>customer</C>, <C>checkout</C>, <C>variant</C>, dan form <C>product</C>/<C>cart</C>. Ganti tombol beli dengan <C>product.cta</C> (WhatsApp, form penawaran, atau link).</li>
            <li><C>product.price</C> bukan angka; pakai <C>product.price_label</C>.</li>
            <li><C>shop</C> menjadi <C>site</C>; <C>shop.name</C> → <C>site.name</C>.</li>
            <li>Theme blocks (<C>blocks/</C>) dan app blocks belum didukung.</li>
          </ul>
          <p className="pt-6 text-muted">Cara tercepat memulai: buka Theme → Edit code → Unduh .zip dari salah satu theme bawaan, lalu ubah dari sana.</p>
        </article>
      </div>
    </div>
  );
}
