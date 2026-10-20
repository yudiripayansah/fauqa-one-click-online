# PRD — Fauqa One Click

Platform pembuat website company profile (multi-tenant SaaS). Company mendaftar, memilih theme, dan dalam hitungan menit punya website yang bisa diatur lewat **theme editor bergaya Shopify** (section & block drag-and-drop), lengkap dengan halaman, showcase produk, blog, form kontak, analytics, file manager, dan custom domain.

**Status:** v0.2 · 16 Oktober 2026 · semua keputusan sudah diambil (§11), siap masuk Fase 0
**Stack:** sama dengan Fauqa Edu & Fauqa PO — Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, RLS) · Vercel + Vercel Cron. Tambahan: **LiquidJS** (template engine theme), **Vercel Domains API** (custom domain), **Resend** (email notifikasi form), **Cloudflare Turnstile** (anti-spam), **Claude API** (AI generator konten, §4.2.1).

---

## 1. Latar belakang

Banyak company (UMKM sampai menengah) butuh website untuk membangun branding, tapi:

| Masalah sekarang | Dampak |
|---|---|
| Bikin website lewat agensi/freelancer mahal dan lama | Company menunda punya website atau puas dengan profil medsos saja |
| Setelah jadi, ubah teks/foto harus minta developer | Website basi, info produk & kontak tidak ter-update |
| Website builder umum (Wix, dsb.) tidak fokus company profile, berbahasa Inggris, dan theme-nya tidak bisa dibuat/dimiliki sendiri | Desain generik, sulit dikustomisasi developer lokal |
| Tidak tahu siapa yang mengunjungi website | Tidak bisa menilai efek branding/kampanye |

## 2. Tujuan

1. **Cepat jadi:** dari daftar sampai website online **< 10 menit** lewat wizard (§4.2) — theme + halaman + konten contoh sesuai industri langsung terisi.
2. **Mudah diubah tanpa coding:** company mengatur tampilan lewat theme editor (section & block, drag-and-drop, live preview) dan konten lewat admin.
3. **Bisa diperluas developer:** theme memakai **Liquid** dengan struktur yang meniru Shopify Online Store 2.0, bisa di-download, diedit, dan di-upload kembali, atau dibuat dari nol.
4. **Branding terukur:** analytics bawaan menunjukkan pengunjung, halaman populer, sumber trafik, dan konversi (klik CTA, form kontak).
5. **Profesional:** custom domain + SSL, SEO dasar lengkap, multi-bahasa (ID + EN), cepat (Lighthouse ≥ 90).

### Metrik keberhasilan

| Metrik | Target |
|---|---|
| Waktu dari daftar sampai situs online (median) | < 10 menit |
| Company yang mempublikasikan situs dari yang mendaftar | ≥ 60% |
| Situs yang masih diedit ≥ 1× per bulan, 3 bulan setelah dibuat | ≥ 40% |
| Lighthouse (mobile) theme bawaan: Performance / SEO / Accessibility | ≥ 90 / ≥ 95 / ≥ 95 |
| TTFB halaman situs (cache hit) | < 200 ms |

### Di luar cakupan (v1)

- **Penjualan produk:** tidak ada keranjang, checkout, pembayaran, stok. Produk hanya showcase + tombol tanya/hubungi.
- Billing & paket berbayar (struktur `plans` + kuota disiapkan, payment gateway di backlog §10.1).
- Theme store / marketplace publik — theme upload bersifat privat per company.
- Kompatibilitas 100% dengan theme Shopify (konsepnya sama, objek Liquid-nya berbeda; lihat §6.6).
- Email marketing / newsletter blast, membership/login pengunjung, blog multi-penulis dengan komentar.
- Aplikasi native.

## 3. Pengguna

| Peran | Siapa | Akses |
|---|---|---|
| **Platform admin** | Tim Fauqa One Click | Semua situs (baca), suspend situs, kelola theme bawaan & preset industri, kuota |
| **Owner** | Pemilik akun company | Semua di situsnya: konten, theme (termasuk kode), domain, anggota, pengaturan, hapus situs |
| **Admin** | Staf company / developer | Sama dengan owner kecuali hapus situs & transfer kepemilikan |
| **Editor** | Staf marketing/konten | Konten (halaman, produk, blog, menu, file, form inbox) + theme editor visual. **Tanpa** edit kode theme, upload theme, domain, anggota |
| **Pengunjung** | Publik | Situs publik; tidak login |

**Target v1: company yang mengurus situsnya sendiri** (self-service). Alur, bahasa UI, dan konten bantuan ditulis untuk orang non-teknis. Satu user tetap bisa menjadi anggota beberapa situs dan berpindah lewat **site switcher**, tapi fitur khusus agensi (white-label, dashboard multi-klien) ada di backlog.

### 3.1 Login

| | Anggota situs & platform admin |
|---|---|
| URL | `app.fauqaoneclick.com/login`, `/daftar` |
| Cara masuk | Email + password (Supabase Auth, seperti Fauqa Edu) |
| Daftar | Self-signup → verifikasi email → wizard buat situs (§4.2) |
| Undang anggota | Owner/admin mengundang via email + peran; link undangan berlaku 7 hari |
| Lupa password | Link reset via email |
| Sesi | Tetap login 30 hari |

Catatan keamanan: cookie sesi admin memakai prefix `__Host-` (host-only, tidak bisa ditimpa dari subdomain situs tenant), karena theme upload boleh berisi JavaScript yang berjalan di subdomain situs (§8.2).

## 4. Alur utama

### 4.1 Siklus hidup situs

```
draft → published ⇄ unpublished
          │
          └── suspended (oleh platform admin)        deleted (soft delete 30 hari)
```

| Status | Arti |
|---|---|
| `draft` | Baru dibuat; situs hanya bisa dilihat anggota (preview) |
| `published` | Online di subdomain + custom domain |
| `unpublished` | Dimatikan sementara oleh owner; pengunjung melihat halaman "segera hadir" (bisa dari theme: `templates/password.json`) |
| `suspended` | Dimatikan platform admin (pelanggaran); owner melihat alasannya |
| `deleted` | Soft delete; dipulihkan dalam 30 hari, setelah itu data & file dihapus permanen (cron) |

Opsi **proteksi password** (situs `published` tapi butuh password pengunjung) untuk soft-launch.

### 4.2 Wizard buat situs (inti "one click")

1. **Nama company** → slug subdomain otomatis (`acme.fauqaoneclick.com`), bisa diubah, dicek unik.
2. **Industri:** Manufaktur · Jasa/Konsultan · Konstruksi & Properti · Teknologi · F&B · Pendidikan · Kesehatan · Umum.
3. **Bahasa:** bahasa utama (ID/EN) + aktifkan bahasa kedua (opsional).
4. **Ceritakan company kamu** (opsional tapi disarankan): 2–5 kalimat tentang bisnis, produk/layanan utama, target pelanggan, dan keunggulan. Dipakai AI generator (§4.2.1).
5. **Brand:** unggah logo (opsional), pilih warna utama (atau diambil otomatis dari logo), pilih pasangan font.
6. **Pilih theme** (+ *preset* gaya theme), dengan pratinjau langsung memakai nama, logo, dan warna company.
7. **Kontak:** email, telepon, WhatsApp, alamat (untuk footer, halaman Kontak, JSON-LD).
8. **"Buat website"** → sistem menyalin theme ke situs, mengisi `settings_data` (warna, font, logo), membuat halaman, susunan section, dan konten — dari **AI generator** bila langkah 4 diisi, atau dari **preset industri** bila dilewati/AI gagal — lalu membuka dashboard dengan checklist "Siap publish".

**Preset industri** = paket data JSON (dikelola platform admin): daftar halaman, susunan section per template, teks contoh ID/EN, gambar placeholder, 3–6 produk/layanan contoh, 2 artikel contoh, menu header/footer. Konten contoh ditandai agar checklist mengingatkan untuk menggantinya. Preset juga menjadi kerangka & contoh (few-shot) untuk AI.

Halaman default hasil wizard: **Beranda, Tentang Kami, Produk/Layanan, Berita, Kontak, Kebijakan Privasi**.

#### 4.2.1 AI generator konten

- **Input:** nama company, industri, deskripsi (langkah 4), bahasa, kontak, theme terpilih.
- **Output (JSON terstruktur, lewat tool use/structured output Claude API):** untuk setiap halaman default — susunan section **hanya dari section yang ada di theme terpilih** (daftar `type` + schema dikirim ke model), nilai setting teks (heading, paragraf, teks tombol, FAQ, statistik, tahapan timeline), 3–6 produk/layanan (nama, ringkasan, deskripsi, spesifikasi), 2 artikel pembuka, meta SEO, tagline — dalam bahasa utama **dan** bahasa kedua bila aktif.
- **Validasi:** hasil dicek terhadap schema section (tipe, `max_blocks`, `options` select, panjang teks). Bagian yang tidak valid diganti dari preset industri; gagal total (timeout 60 detik / error API) → seluruhnya memakai preset, wizard tidak pernah macet.
- Gambar **tidak** di-generate: memakai placeholder dari preset (+ logo company); checklist mengingatkan untuk menggantinya.
- **Di editor & form konten:** tombol ✨ "Tulis dengan AI" di field `text`/`textarea`/`richtext` dan di section ("Isi ulang teks section ini") dengan pilihan nada (formal / santai / persuasif) dan panjang.
- Semua konten hasil AI ditandai `ai_generated` sampai diedit manusia (dipakai checklist & metrik).
- **Batas:** 3 generate situs penuh + 50 generate teks per situs per hari (diatur di `plans.limits`); dicatat di `ai_generations` (token, durasi, status) untuk memantau biaya.
- Model: Claude Sonnet terbaru (`claude-sonnet-5-5`) untuk generate situs; model Haiku (`claude-haiku-5-5`) untuk tulis ulang teks pendek. API key hanya di server.
- Teks yang dikirim ke AI hanya data company yang diisi di wizard/field terkait — tidak ada data form pengunjung.

### 4.3 Theme editor (visual)

Meniru theme editor Shopify:

```
┌─────────────────┬──────────────────────────────────────┬─────────────────┐
│ Template ▾      │  [ Desktop | Tablet | Mobile ]  ID ▾ │ Pengaturan      │
│ (Beranda)       │                                      │ section/block   │
│                 │                                      │                 │
│ Header (group)  │         Live preview (iframe)        │ Heading  [____] │
│  ▸ Announcement │         situs dengan perubahan       │ Gambar   [pick] │
│  ▸ Header       │         yang belum disimpan          │ Warna    [■]    │
│ Template        │                                      │ Layout   (o)(o) │
│  ⠿ Hero         │   klik elemen di preview → memilih   │                 │
│     ⠿ Tombol    │   section/block di panel kiri         │ [Hapus section] │
│     ⠿ Tombol    │                                      │                 │
│     + Tambah block                                     │                 │
│  ⠿ Logo list    │                                      │                 │
│  + Tambah section                                      │                 │
│ Footer (group)  │                                      │                 │
│ ⚙ Theme settings│                     [Undo][Redo] [Simpan]              │
└─────────────────┴──────────────────────────────────────┴─────────────────┘
```

- **Panel kiri:** daftar section per template + section group (header/footer) dan block di dalamnya. **Drag-and-drop** untuk mengurutkan section dan block (dnd-kit); sembunyikan/tampilkan (ikon mata = `disabled`), duplikat, hapus.
- **Tambah section/block:** daftar diambil dari `presets` di `{% schema %}` setiap section, dengan batas `max_blocks`, `limit`, `enabled_on`/`disabled_on` dihormati.
- **Panel kanan:** form otomatis dari `settings` di schema (tipe input §6.4). Bila bahasa editor ≠ bahasa utama, field teks menyimpan **terjemahan** (§4.6), field non-teks tetap bersama.
- **Live preview:** iframe ke situs dengan token preview. Setiap perubahan setting → re-render **satu section** lewat Section Rendering API (`/api/render-section`) lalu DOM-nya diganti; theme JS menerima event (`fauqa:section:load`, `:unload`, `:select`, `fauqa:block:select`, `:deselect`) seperti di Shopify.
- **Klik di preview** memilih section/block terkait (pakai atribut dari `{{ block.fauqa_attributes }}`).
- **Theme settings** (global): warna, tipografi, layout, tombol, sosial media, favicon — dari `config/settings_schema.json`.
- **Template switcher:** Beranda, Halaman (default + template alternatif mis. `page.about`), Produk, Koleksi, Blog, Artikel, Kontak, Pencarian, 404, Password. Bisa membuat **template alternatif baru** dari editor ("Buat template" → `page.<nama>.json`).
- **Simpan** menulis template JSON / `settings_data.json`. Seperti Shopify: mengedit **theme live** langsung tayang saat disimpan; untuk perubahan besar, duplikat theme → edit → publish.
- Undo/redo (di memori, per sesi editor), peringatan bila meninggalkan halaman dengan perubahan belum disimpan, deteksi konflik bila dua orang menyimpan template yang sama (pakai `updated_at`).
- Editor dioptimalkan untuk **desktop/tablet** (≥ 1024px); di HP hanya tersedia mode baca + edit konten.

### 4.4 Theme library & kode

Halaman `/themes` per situs:

- **Theme live** (satu) dan **theme tersimpan** (maks. sesuai kuota, default 10).
- Aksi: Customize (editor visual) · Edit code · Preview · Publish · Duplikat · Ganti nama · **Download (.zip)** · Hapus.
- **Tambah theme:** dari theme bawaan, atau **Upload .zip** (validasi §6.7).
- **Edit code:** editor kode di browser (Monaco) dengan pohon file sesuai struktur theme, highlight Liquid/JSON/CSS/JS, simpan dengan validasi sintaks, riwayat 20 versi terakhir per file + *revert*. Tambah/rename/hapus file; unggah aset.
- Theme bawaan bisa di-*update* oleh platform; situs yang memakai salinan lama mendapat notifikasi "versi baru tersedia" (salinan tidak pernah ditimpa otomatis).

### 4.5 Konten

| Modul | Isi |
|---|---|
| **Halaman** | Judul, slug, konten rich text (TipTap), pilihan template (`page` / `page.<suffix>`), SEO, status `draft`/`published`, jadwal publish |
| **Produk / layanan** (showcase) | Nama, slug, galeri gambar/video, deskripsi rich text, ringkasan, **spesifikasi** (pasangan label–nilai), harga tampil (opsional, teks bebas mis. "Mulai Rp 5 jt" atau "Hubungi kami"), tag, koleksi, file unduhan (brosur/datasheet), CTA (WhatsApp / form inquiry / link), produk terkait, template, SEO, status |
| **Koleksi** | Kelompok produk (manual atau otomatis berdasar tag), gambar, deskripsi, urutan |
| **Blog** | Satu atau lebih blog (mis. "Berita", "Artikel"); artikel: judul, cover, isi, penulis, tag, tanggal terbit, SEO |
| **Menu navigasi** | Menu bertingkat (maks. 3 level) untuk header/footer; item menunjuk halaman, produk, koleksi, blog, artikel, URL luar. Dipanggil di theme lewat `linklists` |
| **Form & inbox** | §4.7 |
| **File** | §4.8 |
| **Redirect** | URL lama → baru (301), impor CSV — berguna saat pindah dari website lama |

Semua konten mendukung **terjemahan** (§4.6) dan **SEO** (meta title, description, OG image, `noindex`).

Konten lain khas company profile — tim, testimoni, klien/partner, sejarah/timeline, FAQ, statistik, sertifikasi, galeri — **tidak** dibuat sebagai modul data, melainkan sebagai **section + block** di theme (lebih fleksibel, cukup untuk skala company profile).

### 4.6 Multi-bahasa

- Situs punya **bahasa utama** (ID atau EN) dan maks. 1 bahasa tambahan di v1 (ID + EN).
- URL: bahasa utama di root (`/`), bahasa tambahan berprefiks (`/en/...`). `hreflang` & tautan *language switcher* otomatis (`localization` object di Liquid).
- **Yang diterjemahkan:** konten (halaman, produk, koleksi, artikel, menu, SEO), nilai setting teks di theme (heading, teks tombol, dsb.), string bawaan theme (`locales/*.json`, dipanggil `{{ 'general.contact' | t }}`).
- Admin: setiap form konten punya tab bahasa; theme editor punya pemilih bahasa. Halaman **"Terjemahan"** menampilkan semua teks yang belum diterjemahkan.
- Teks yang belum diterjemahkan jatuh ke bahasa utama (fallback).

### 4.7 Form kontak & inquiry

- Theme memakai tag `{% form 'contact' %}` (seperti Shopify): field standar `contact[name]`, `contact[email]`, `contact[phone]`, `contact[body]` + field bebas `contact[<apa saja>]`. Tipe form: `contact`, `inquiry` (dengan `product` terisi), `newsletter` (hanya menyimpan email).
- Kiriman tersimpan di **inbox** (`/forms`): daftar, detail, tandai dibaca/spam/selesai, catatan internal, ekspor CSV.
- Notifikasi email (Resend) ke daftar email penerima di pengaturan; *reply-to* = email pengirim, jadi owner cukup balas dari email.
- Anti-spam: honeypot + Cloudflare Turnstile (invisible) + rate limit per IP (5/10 menit per situs).
- Setelah kirim: redirect ke halaman yang sama dengan `form.posted_successfully?` = true, atau ke halaman "terima kasih" pilihan.
- **WhatsApp click-to-chat:** tombol melayang (opsional) dan CTA produk membuka `wa.me/<nomor>?text=<template>`, tanpa gateway. Kliknya tercatat di analytics.

### 4.8 File manager

- Satu pustaka file per situs (Supabase Storage, bucket publik `site-files/{site_id}/...`), dipakai oleh image picker di editor, konten, dan theme (`{{ 'logo.png' | file_url }}`).
- Folder, unggah banyak file sekaligus (drag-and-drop), ganti nama, pindah, hapus, cari, filter tipe, tampilan grid/list.
- Detail file: pratinjau, ukuran, dimensi, **alt text** (per bahasa), URL salin sekali klik, **dipakai di mana** (referensi dari konten/theme; peringatan saat menghapus file yang masih dipakai).
- Gambar: saat unggah dikonversi & diperkecil ke beberapa lebar (400/800/1200/1920 px, WebP) dengan `sharp`; filter `image_url: width: 800` memilih varian terdekat. Batas: gambar 10 MB, video 50 MB, dokumen (PDF, DOCX, XLSX) 20 MB.
- Tipe yang diizinkan: gambar (jpg, png, webp, gif, svg — **disanitasi**), video (mp4, webm), PDF & dokumen kantor, font (woff2).
- Kuota storage per situs (default 1 GB, §8.3) dengan indikator pemakaian.
- Aset theme (`assets/`) terpisah dari file manager — ikut theme saat download/upload.

### 4.9 Analytics bawaan

Tanpa cookie, ramah privasi (pola Plausible), jadi tidak perlu banner cookie.

- **Pengumpulan:** script kecil (< 2 KB) disisipkan otomatis lewat `{{ content_for_header }}`; mengirim `navigator.sendBeacon` ke `/api/collect` di domain situs. Pengunjung unik = `hash(salt harian + site_id + IP + user agent)`; **IP tidak disimpan**, salt dirotasi tiap hari.
- **Event otomatis:** pageview, klik WhatsApp, klik telepon/email (`tel:`/`mailto:`), unduh file, klik link keluar, kirim form, lihat produk. **Event kustom** dari theme: `data-fauqa-event="nama"` di elemen apa pun.
- **Dashboard** (`/analytics`): rentang waktu (hari ini, 7/30/90 hari, kustom), pengunjung unik, pageview, durasi rata-rata, bounce rate; grafik harian; halaman teratas; sumber/referrer & UTM; negara/kota (header geo Vercel); perangkat, browser, OS; produk paling dilihat; konversi (form & WhatsApp) per sumber. Bandingkan dengan periode sebelumnya. Ekspor CSV.
- **Realtime:** pengunjung 5 menit terakhir.
- Filter bot (user agent + heuristik), kunjungan anggota situs yang login di admin dikecualikan (flag dari preview).
- Integrasi pihak ketiga opsional di pengaturan: **GA4 ID, Meta Pixel ID, Google Tag Manager, Google Search Console verification** — bila diisi, pengunjung melihat banner persetujuan cookie (bawaan platform).
- Retensi: event mentah 90 hari, ringkasan harian selamanya.

### 4.10 Domain

- **Subdomain gratis:** `<slug>.fauqaoneclick.com` (wildcard di Vercel), bisa diganti (subdomain lama redirect 30 hari).
- **Custom domain:** owner/admin menambah domain (`acme.co.id` dan/atau `www.acme.co.id`) → sistem mendaftarkan ke project Vercel (Domains API) → menampilkan instruksi DNS (A record apex / CNAME `www`) → cek verifikasi berkala (cron) → SSL otomatis dari Vercel.
- Pilih **domain utama**; domain lain (termasuk subdomain platform) redirect 301 ke domain utama.
- Status domain: `pending_dns` · `verifying` · `active` · `misconfigured` (email peringatan ke owner bila DNS berubah).

### 4.11 SEO & pengaturan situs

- Otomatis: `sitemap.xml` (per bahasa), `robots.txt` (bisa diedit), canonical, `hreflang`, Open Graph & Twitter card, JSON-LD `Organization`/`LocalBusiness`, `Product` (tanpa offer harga), `Article`, `BreadcrumbList`.
- Pengaturan umum: nama situs, tagline, logo, favicon, identitas company (alamat, telepon, email, WhatsApp, jam operasional, koordinat peta), sosial media, bahasa, zona waktu, email penerima form, password situs, kode tambahan `<head>` (owner/admin saja).
- Pencarian situs: `/search?q=` di halaman, produk, artikel (Postgres full-text search, per bahasa).
- **Badge "Dibuat dengan Fauqa One Click"**: theme menaruhnya lewat `{{ powered_by_link }}` (seperti Shopify) di footer. Bila tidak ditemukan di output theme, platform menyisipkan badge kecil di bawah halaman. Owner tidak bisa mematikannya; hanya platform admin (`sites.show_badge`) — disiapkan untuk plan berbayar nanti. Link badge membawa `?ref=<slug>` untuk mengukur akuisisi.

## 5. Fitur per modul (admin `app.fauqaoneclick.com`)

Navigasi samping (desktop) / bawah (HP): **Beranda · Konten · Tampilan · Analytics · Pengaturan**, ditambah site switcher di atas.

| Halaman | Isi |
|---|---|
| **Beranda** `/s/[site]` | Status situs + tombol Publish, checklist "Siap publish" (ganti konten contoh, logo, domain, kontak), ringkasan analytics 7 hari, form masuk terbaru, pemakaian kuota |
| **Konten** | Halaman · Produk · Koleksi · Blog · Menu · Form (inbox) · File · Redirect · Terjemahan |
| **Tampilan** | Theme library (§4.4) · Customize (editor §4.3) · Edit code |
| **Analytics** | Dashboard §4.9 |
| **Pengaturan** | Umum · Domain · Bahasa · SEO · Integrasi (GA4/Pixel/GTM) · Form & notifikasi · Anggota & peran · Kuota · Hapus situs |
| **Akun** | Profil, ganti password, daftar situs saya |
| **Platform admin** `/platform` | Daftar situs (status, domain, pemakaian), suspend/unsuspend, theme bawaan (upload versi baru), preset industri, batas kuota per plan, log audit |

## 6. Sistem theme

Inti produk. **Sederhana, tapi semirip mungkin dengan Shopify Online Store 2.0** agar developer theme Shopify langsung paham.

### 6.1 Struktur theme

```
theme.zip
├── layout/
│   ├── theme.liquid            # wajib: kerangka HTML, {{ content_for_header }}, {{ content_for_layout }}
│   └── password.liquid         # opsional
├── templates/                  # JSON: daftar & urutan section per tipe halaman
│   ├── index.json              # wajib
│   ├── page.json               # wajib
│   ├── page.about.json         # template alternatif (suffix)
│   ├── product.json  collection.json  list-collections.json
│   ├── blog.json  article.json  search.json  404.json  password.json
├── sections/
│   ├── header-group.json       # section group (header)
│   ├── footer-group.json       # section group (footer)
│   ├── hero.liquid             # section = HTML Liquid + {% schema %}
│   └── ...
├── snippets/                   # potongan reusable, dipanggil {% render 'card-product', product: p %}
├── assets/                     # css, js, gambar, font theme → {{ 'base.css' | asset_url }}
├── config/
│   ├── settings_schema.json    # definisi theme settings global
│   └── settings_data.json      # nilai theme settings + presets gaya
└── locales/
    ├── id.json  en.json        # string untuk filter t
    └── id.schema.json en.schema.json   # label editor (opsional)
```

Disederhanakan dibanding Shopify: **tanpa** folder `blocks/` (theme blocks) dan nested blocks di v1 — block didefinisikan di schema section seperti OS 2.0 awal. Theme blocks masuk backlog.

### 6.2 Template JSON

```json
{
  "sections": {
    "hero": {
      "type": "hero",
      "settings": { "heading": "Solusi baja untuk industri", "image": "files/hero.jpg", "height": "large" },
      "blocks": {
        "btn-1": { "type": "button", "settings": { "label": "Lihat produk", "link": "/collections/all" } }
      },
      "block_order": ["btn-1"]
    },
    "clients": { "type": "logo-list", "disabled": false, "settings": {} }
  },
  "order": ["hero", "clients"]
}
```

Maks. 25 section per template, 50 block per section (sama dengan batas Shopify).

### 6.3 Section & schema

```liquid
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
    { "type": "text", "id": "heading", "label": "Heading", "default": "Judul" },
    { "type": "image_picker", "id": "image", "label": "Gambar" },
    { "type": "select", "id": "height", "label": "Tinggi",
      "options": [{ "value": "small", "label": "Kecil" }, { "value": "large", "label": "Besar" }], "default": "large" }
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
```

`fauqa_attributes` juga tersedia dengan alias `shopify_attributes` agar snippet dari theme Shopify bisa dipakai ulang.

### 6.4 Tipe setting (input di editor)

| Kategori | Tipe |
|---|---|
| Dasar | `text`, `textarea`, `number`, `range`, `checkbox`, `select`, `radio`, `color`, `color_background` (gradien) |
| Teks kaya | `richtext`, `inline_richtext`, `html`, `liquid` (owner/admin saja) |
| Media | `image_picker`, `video` (dari file manager), `video_url` (YouTube/Vimeo) |
| Link & data | `url`, `page`, `product`, `product_list`, `collection`, `collection_list`, `blog`, `article`, `link_list` (menu) |
| Gaya | `font_picker` (Google Fonts terkurasi), `color_scheme` (dari theme settings) |
| Penanda (tanpa nilai) | `header`, `paragraph` |

Setiap tipe divalidasi (mis. `range` wajib `min`/`max`/`step`; `select` wajib `options`).

### 6.5 Objek, tag, dan filter Liquid

| Jenis | Yang tersedia |
|---|---|
| **Objek global** | `site` (nama, logo, kontak, sosial, url), `settings` (theme settings), `request` (path, host, locale, `design_mode`), `localization` (bahasa tersedia & aktif), `linklists`, `pages`, `collections`, `blogs`, `routes`, `template`, `canonical_url`, `page_title`, `page_description`, `page_image` |
| **Objek per halaman** | `page`, `product` (gambar, spesifikasi, harga tampil, CTA, file, terkait), `collection` (+ `products` dengan paginate), `blog`, `article`, `search` |
| **Section** | `section` (`id`, `settings`, `blocks`, `index`), `block` (`id`, `type`, `settings`, `fauqa_attributes`) |
| **Tag** | Standar LiquidJS (`if`, `for`, `case`, `assign`, `capture`, `render`, `raw`, `comment`, `liquid`, `echo`) + `section`, `sections` (section group), `schema`, `form`, `paginate`, `style`, `stylesheet`, `javascript` |
| **Filter** | Standar LiquidJS + `asset_url`, `file_url`, `image_url`, `image_tag`, `t`, `money` (harga tampil), `date` (sesuai bahasa), `link_to`, `url_for_locale`, `json`, `handleize`, `placeholder_svg_tag`, `powered_by_link` (objek), `stylesheet_tag`, `script_tag`, `font_face`, `font_url`, `default_pagination` |

Daftar lengkap & contoh menjadi **dokumentasi developer theme** (halaman publik `docs.fauqaoneclick.com`) — dibuat di Fase 4.

### 6.6 Hubungan dengan theme Shopify

Mirip, **tidak kompatibel langsung**: struktur folder, template JSON, schema, section group, `render`, `t`, `asset_url`, `form` sama; objek e-commerce (`cart`, `customer`, `checkout`, `variant`, `product.price` sebagai angka) **tidak ada**. Theme Shopify bisa diport dengan menghapus bagian e-commerce. Panduan porting masuk dokumentasi.

### 6.7 Validasi upload & keamanan theme

- ZIP maks. 50 MB, maks. 1.000 file; hanya folder di §6.1; ekstensi yang diizinkan per folder; nama file aman (cegah *zip slip* / path traversal).
- Wajib ada `layout/theme.liquid`, `templates/index.json`, `templates/page.json`, `config/settings_schema.json`.
- Semua `.liquid` di-*parse*, semua JSON & `{% schema %}` divalidasi terhadap skema; hasil berupa laporan error per file + baris (upload ditolak bila ada error).
- Render dibatasi dengan opsi LiquidJS (`parseLimit`, `renderLimit` ±500 ms/section, `memoryLimit`), tanpa akses filesystem/jaringan — template hanya membaca data yang kita berikan.
- JavaScript theme hanya berjalan di **domain situs** (bukan `app.`); admin & editor diisolasi oleh origin berbeda. Preview di editor memakai iframe ke domain situs dengan token preview bertanda tangan berumur pendek.
- SVG dari upload disanitasi (hapus script & event handler).

## 7. Rendering situs

```
Request https://acme.co.id/en/products/baja-ringan
  → proxy.ts: host → site_id (tabel domains, cache)          [Next.js 16 "proxy", d/h middleware]
  → rewrite ke /_site/[siteId]/[[...path]]
  → locale dari prefix path (/en) → route matching:
       /                       → index
       /pages/:handle          → page (atau page.<template_suffix>)
       /collections, /collections/:handle, /products/:handle
       /blogs/:blog, /blogs/:blog/:article
       /search, /contact (POST form), /sitemap.xml, /robots.txt
  → muat resource + terjemahan → pilih template JSON
  → render tiap section (Liquid) → bungkus layout/theme.liquid
       content_for_header: SEO meta, JSON-LD, CSS/JS platform, analytics, (editor bridge bila preview)
  → HTML
```

- **Cache:** hasil render di-cache per (situs, theme, path, bahasa) dengan `'use cache'` + `cacheTag(site:<id>)`; setiap simpan konten/theme memanggil `revalidateTag`. Preview & editor tidak memakai cache.
- File theme (teks) dimuat dari DB sekali per versi theme dan disimpan di cache memori/Next; template Liquid yang sudah di-*parse* juga di-cache.
- Route fleksibel: handle URL per bahasa bisa diterjemahkan (mis. `/tentang-kami` dan `/en/about-us`).
- 404 memakai `templates/404.json`; redirect (§4.5) dicek sebelum 404.

## 8. Arsitektur

Mengikuti pola Fauqa Edu & PO: satu aplikasi Next.js, otorisasi di database (RLS), service role hanya untuk proses sistem.

```
                         ┌──────────────────────── Next.js 16 (Vercel) ────────────────────────┐
Anggota situs ─────────> │ app.fauqaoneclick.com   /login /s/[site]/*  admin, editor, kode      │
Platform admin ────────> │                         /platform/*                                  │
Pengunjung ────────────> │ *.fauqaoneclick.com     proxy.ts → /_site/[siteId]/*  render Liquid  │
                         │ + custom domain         /api/collect  /contact  /api/render-section  │
                         │ lib/theme               LiquidJS engine, loader file theme, filters  │
                         │ lib/ai                  → Claude API (generate situs & teks)         │
                         │ lib/domains             → Vercel Domains API                         │
                         │ lib/email               → Resend                                     │
Vercel Cron ───────────> │ api/cron/*              rollup analytics, cek DNS, publish terjadwal,│
                         │                         hapus permanen situs, rotasi salt            │
                         └───────────────────────────────┬────────────────────────────────────┘
                                                         ▼
          Supabase: Postgres + RLS · Auth · Storage (site-files: publik · theme-assets: publik · exports: privat)
```

### 8.1 Skema data inti

| Tabel | Kolom utama |
|---|---|
| `profiles` | `user_id`, `name`, `is_platform_admin` |
| `sites` | `id`, `name`, `slug` (unik, subdomain), `status`, `industry`, `default_locale`, `locales` (array), `live_theme_id`, `primary_domain_id`, `plan_id`, `settings` (jsonb: identitas, kontak, sosial, SEO, integrasi, email form), `password_hash`, `show_badge` (default true), `deleted_at` |
| `site_members` | `site_id`, `user_id`, `role` (`owner`/`admin`/`editor`); `site_invites`: `email`, `role`, `token`, `expires_at` |
| `domains` | `site_id`, `hostname` (unik), `type` (`platform`/`custom`), `status`, `verification` (jsonb), `last_checked_at` |
| `plans` | `id`, `name`, `limits` (jsonb: storage_mb, pages, products, themes, locales, custom_domains, ai_site_per_day, ai_text_per_day) — v1 hanya plan "Free" |
| `themes` | `id`, `site_id` (null = theme bawaan), `name`, `source` (`builtin`/`upload`/`duplicate`), `based_on_id`, `builtin_version`, `version` (naik tiap simpan, untuk cache) |
| `theme_files` | `theme_id`, `key` (path, mis. `sections/hero.liquid`), `content` (teks) **atau** `storage_path` (biner), `checksum`, `size`, `updated_at`, `updated_by` |
| `theme_file_versions` | `theme_file_id`, `content`, `created_at`, `created_by` (simpan 20 terakhir) |
| `pages` | `site_id`, `handle`, `title`, `body` (html), `template_suffix`, `seo` (jsonb), `status`, `published_at` |
| `products` | `site_id`, `handle`, `title`, `summary`, `body`, `media` (array file id), `specs` (jsonb `[{label, value}]`), `price_label`, `tags`, `files`, `cta` (jsonb), `related_ids`, `template_suffix`, `seo`, `status`, `position` |
| `collections` / `collection_products` | `handle`, `title`, `body`, `image`, `rule` (manual/tag), urutan |
| `blogs` / `articles` | blog: `handle`, `title`; artikel: `blog_id`, `handle`, `title`, `excerpt`, `body`, `cover`, `author`, `tags`, `published_at`, `seo`, `status` |
| `menus` | `site_id`, `handle` (`main-menu`, `footer`), `items` (jsonb pohon maks. 3 level) |
| `translations` | `site_id`, `locale`, `resource_type` (`page`/`product`/`collection`/`article`/`menu`/`theme_setting`/`file`/`site`), `resource_key`, `field`, `value` — unik per kombinasi |
| `files` | `site_id`, `folder`, `name`, `storage_path`, `mime`, `size`, `width`, `height`, `variants` (jsonb), `alt` |
| `file_usages` | `file_id`, `resource_type`, `resource_key` (diperbarui saat konten/theme disimpan) |
| `form_submissions` | `site_id`, `form_type`, `fields` (jsonb), `product_id`, `locale`, `page_path`, `status` (`new`/`read`/`done`/`spam`), `note`, `created_at` |
| `redirects` | `site_id`, `from_path`, `to_url`, `hits` |
| `analytics_events` | `site_id`, `ts`, `type`, `name`, `path`, `locale`, `referrer_host`, `utm` (jsonb), `country`, `city`, `device`, `browser`, `os`, `visitor_hash`, `session_hash`, `props` (jsonb) — **dipartisi per bulan** |
| `analytics_daily` | `site_id`, `date`, `dimension`, `value`, `visitors`, `pageviews`, `events` (rollup) |
| `industry_presets` | `key`, `name`, `data` (jsonb: halaman, susunan section, teks ID/EN, produk & artikel contoh) |
| `ai_generations` | `site_id`, `user_id`, `kind` (`site`/`text`), `model`, `input_tokens`, `output_tokens`, `duration_ms`, `status` (`ok`/`fallback`/`error`), `created_at` |
| `abuse_reports` | `site_id`, `reason` (`phishing`/`scam`/`spam`/`lainnya`), `detail`, `reporter_email`, `status` (`new`/`dismissed`/`actioned`) |
| `audit_logs` | siapa mengubah apa dan kapan (theme, kode, domain, anggota, publish) |

Aturan yang dijaga di database:
- **RLS:** semua tabel ber-`site_id` hanya bisa diakses anggota situs tersebut; peran `editor` ditolak menulis `theme_files` kecuali file template JSON & `settings_data.json` (lewat RPC editor), `domains`, `site_members`.
- Situs publik dirender server-side dengan service role, hanya membaca data `published` milik `site_id` hasil resolusi host.
- Kuota dicek di RPC/trigger (jumlah halaman, produk, theme, total ukuran file) — bukan hanya di UI.
- `domains.hostname` & `sites.slug` unik global; slug cadangan (`app`, `www`, `docs`, `api`, `admin`, dsb.) ditolak.

### 8.2 Keamanan

- **Isolasi admin dari situs tenant.** Admin (`app.fauqaoneclick.com`) dan situs tenant (`<slug>.fauqaoneclick.com`) satu domain induk, jadi bagi browser keduanya *same-site*. Karena theme JS dan field `html`/`liquid` berjalan di subdomain tenant, wajib:
  1. Cookie sesi admin **host-only dengan prefix `__Host-`** (Supabase SSR `cookieOptions.name`), `Secure`, `HttpOnly`, `SameSite=Lax` — subdomain tenant tidak bisa membaca maupun menimpanya (*cookie tossing*).
  2. **Cek `Origin`** pada setiap request yang mengubah data di admin (Server Actions Next.js sudah melakukannya; route handler `app/api/*` admin ditambah cek yang sama). `SameSite` saja tidak cukup karena subdomain tenant dianggap same-site.
  3. Admin mengirim CSP ketat + `frame-ancestors 'self'`; situs tenant tidak pernah me-load script dari `app.`.
  4. Tidak ada cookie apa pun yang di-set ke `Domain=.fauqaoneclick.com`.
  5. Slug cadangan ditolak (§8.1).
- **Reputasi domain:** satu situs phishing bisa membuat `fauqaoneclick.com` (termasuk admin) ditandai Google Safe Browsing. Pencegahan: verifikasi email wajib sebelum publish; situs baru tidak boleh memakai form dengan field password/kartu (validator theme memperingatkan `type="password"`); tombol "Laporkan situs" di badge → `abuse_reports` → platform admin suspend dalam hitungan menit; pantau domain di Google Search Console. **Rencana cadangan:** bila suatu saat ditandai, situs tenant dipindah ke domain terpisah (mis. `*.fauqaoneclick.site`) — cukup ganti konfigurasi host di `proxy.ts` + redirect 301, tanpa ubah fitur.
- Input field `richtext` dari konten disanitasi (allowlist tag); `html`/`liquid` hanya untuk owner/admin dan dicatat di audit log.
- Token preview: JWT bertanda tangan (site, theme, user, exp 1 jam).
- Endpoint publik (`/contact`, `/api/collect`) dengan rate limit & validasi ukuran payload.
- Upload: validasi MIME berdasarkan isi file (bukan ekstensi saja), sanitasi SVG.

### 8.3 Kuota default (plan "Free")

| Item | Batas |
|---|---|
| Storage file | 1 GB |
| Halaman / produk / artikel | 100 / 500 / 500 |
| Theme tersimpan | 10 |
| Bahasa | 2 |
| Custom domain | 2 hostname (apex + www) |
| Anggota | 5 |
| AI generator | 3 generate situs + 50 generate teks per hari |
| Form submission | tidak dibatasi (spam dibuang setelah 30 hari) |

## 9. Kebutuhan non-fungsional

- **Performa situs:** HTML ter-cache di edge, gambar WebP responsif (`srcset` dari `image_tag`), font di-*preload*, JS platform < 5 KB. Theme bawaan wajib Lighthouse mobile ≥ 90.
- **Skala (medium, v1):** acuan ±100–500 situs aktif, ±1–2 juta pageview/bulan total, ±50 anggota editor bersamaan. Supabase Pro (karena volume event analytics & storage), Vercel Pro (wildcard domain & Domains API).
- **Keandalan:** situs tetap tayang dari cache bila Supabase sedang lambat; perubahan theme gagal validasi tidak pernah menimpa file yang berjalan.
- **Privasi (UU PDP 27/2022):** analytics tanpa cookie & tanpa menyimpan IP; data form hanya bisa dilihat anggota situs; company bisa ekspor semua datanya (konten JSON + theme zip + file) dan menghapus situs.
- **Aksesibilitas:** admin & theme bawaan WCAG AA (kontras, fokus keyboard, label form, alt text diwajibkan sebagai peringatan di file manager).
- **Backup:** backup harian Supabase (Pro, PITR opsional); ekspor situs mandiri oleh owner.

### 9.1 Tampilan admin

- **Desktop-first untuk editor & kode** (≥ 1024px); dashboard, konten, inbox form, dan analytics **responsif** sampai 360px agar bisa dicek dari HP.
- Gaya netral & tenang agar tidak "bersaing" dengan desain situs company: latar abu sangat muda, aksen satu warna, tipografi **Plus Jakarta Sans** (sama dengan Fauqa PO), komponen kartu radius 12–16px, mode gelap mengikuti sistem.
- Token warna/radius/font didefinisikan sekali di `@theme` Tailwind 4.

### 9.2 Theme bawaan v1

| Theme | Karakter | Cocok untuk |
|---|---|---|
| **Lumen** | Bersih, korporat, banyak ruang putih | Jasa, konsultan, teknologi, kesehatan |
| **Forge** | Tegas, kontras tinggi, foto besar | Manufaktur, konstruksi, industri |
| **Aura** | Hangat, membulat, banyak foto & warna | F&B, pendidikan, kreatif, hospitality |

Masing-masing dengan 3 preset gaya (warna & font) dan section bawaan:

- **Group:** announcement bar, header (logo, menu, language switcher, CTA), footer (kolom menu, kontak, sosial, copyright).
- **Konten umum:** hero / slideshow, image with text, rich text, multicolumn (fitur/layanan), statistik (angka), logo list (klien/partner), testimoni, tim, timeline (sejarah), FAQ (accordion), galeri, video, CTA banner, form kontak, peta (Google Maps embed), unduhan (brosur), custom Liquid.
- **Data:** featured products, featured collection, collection list, blog posts terbaru.
- **Main (per template):** main-page, main-product, main-collection, main-list-collections, main-blog, main-article, main-search, main-404, main-password.

### 9.3 Data dummy

`supabase/seed.sql` (pola sama dengan Fauqa Edu/PO):

- 1 platform admin, 3 user (owner, admin, editor) dengan password demo.
- 3 situs: manufaktur (Forge, ID+EN, custom domain contoh berstatus `pending_dns`), konsultan (Lumen, ID), kafe (Aura, `draft`, konten hasil AI).
- Masing-masing ±6 halaman, ±12 produk dalam 3 koleksi, ±6 artikel, menu header/footer, ±40 file contoh, ±25 form submission (termasuk spam).
- Analytics 90 hari terakhir hasil generator (pola harian & sumber trafik realistis) agar dashboard terlihat hidup.
- Semua email memakai domain `example.com`; Resend di development berjalan dalam mode log-saja.

## 10. Roadmap

Estimasi untuk 1 developer.

| Fase | Isi | Target | Selesai bila |
|---|---|---|---|
| **0. Fondasi** | Auth, situs & anggota, site switcher, `proxy.ts` multi-host + subdomain, tabel theme/file, LiquidJS engine + loader, theme Lumen versi minimal (layout + 5 section), render halaman index & page, data dummy | 2–3 minggu | Situs dummy tayang di subdomain dari theme Liquid di DB |
| **1. Konten & file** | Halaman, produk, koleksi, blog, menu, file manager (upload, varian gambar, folder, picker), form kontak + inbox + email, SEO (sitemap, meta, JSON-LD), redirect, pencarian | 3 minggu | Company bisa mengisi semua konten & menerima form dari situsnya |
| **2. Theme editor** | Editor visual (section/block, drag-and-drop, settings form semua tipe, live preview + Section Rendering API, section group, template alternatif, theme settings, undo/redo), theme library (duplikat, publish, preview) | 3–4 minggu | Seluruh tampilan bisa diubah tanpa kode, seperti di Shopify |
| **3. Kode & paket theme** | Edit code (Monaco + riwayat), download/upload ZIP + validator, theme Forge & Aura, semua section bawaan, 3 preset gaya per theme | 3 minggu | Developer bisa download, ubah, dan upload theme sendiri; 3 theme bawaan siap |
| **4. One click & publish** | Wizard + preset industri, **AI generator** (situs penuh + tulis teks di editor, fallback preset), multi-bahasa (terjemahan konten, theme, locales), custom domain via Vercel, proteksi password, publish/unpublish, badge, kuota, dokumentasi developer theme | 3–4 minggu | Daftar → isi deskripsi → situs online di domain sendiri dalam < 10 menit |
| **5. Analytics & platform** | Script collect, event otomatis/kustom, dashboard + realtime, rollup & retensi, integrasi GA4/Pixel/GTM + banner cookie, platform admin, laporan penyalahgunaan, ekspor situs | 2 minggu | Owner melihat pengunjung & konversi; platform admin bisa mengelola & suspend situs |

Total ±16–19 minggu.

### 10.1 Backlog

- Billing & paket berbayar (Midtrans/Xendit), uji coba 14 hari, batas per plan.
- Theme store publik (theme dari developer, review & moderasi, theme berbayar).
- Theme blocks (`blocks/`) & nested blocks, `{% content_for 'blocks' %}`.
- Lebih dari 2 bahasa; terjemahan otomatis dengan AI (tombol "Terjemahkan semua").
- AI lanjutan: generate gambar, saran SEO, ringkasan analytics mingguan.
- Fitur agensi: white-label (admin & badge dengan brand agensi), dashboard multi-klien.
- Draft/publish per perubahan theme (saat ini pola Shopify: duplikat theme).
- CLI theme (`fauqa theme dev/push/pull`) dengan hot reload — saat ini cukup upload ZIP + editor kode.
- Modul karier/lowongan, modul event, katalog PDF otomatis dari produk.
- Popup/promo, A/B test hero, heatmap.
- Email hosting/forwarding untuk custom domain.
- Login Google; 2FA untuk owner.
- Integrasi WhatsApp gateway (auto-reply inquiry) — bisa memakai `wa-gateway` dari Fauqa PO.
- Impor konten dari WordPress/website lama.

## 11. Keputusan yang sudah diambil

| Topik | Keputusan | Dampak |
|---|---|---|
| Model produk | **Multi-tenant SaaS** — company mendaftar sendiri | Tabel `sites` + `site_members`, RLS per `site_id`, host-based routing (§7) |
| Template language | **Liquid (LiquidJS)**, struktur meniru Shopify OS 2.0 | §6; aman (sandbox), familiar bagi developer Shopify |
| Billing | **Gratis dulu** di v1 | Tabel `plans` + kuota disiapkan; payment gateway di backlog |
| Bahasa situs | **Multi-bahasa ID + EN** | Tabel `translations`, prefix URL `/en`, `t` filter, hreflang (§4.6) |
| Analytics | **Built-in tanpa cookie** + opsi GA4/Pixel/GTM | §4.9; tabel event dipartisi + rollup harian |
| Theme upload | **Privat per company**; theme publik hanya bawaan | Tidak perlu moderasi di v1 |
| Custom domain | **Ya di v1**, via Vercel Domains API | Butuh Vercel Pro; cron cek DNS |
| Nama produk | **Fauqa One Click** | — |
| Domain | **Satu domain**: admin `app.fauqaoneclick.com`, situs `<slug>.fauqaoneclick.com` | Wajib cookie `__Host-` + cek `Origin` + kontrol penyalahgunaan (§8.2); domain terpisah sebagai rencana cadangan |
| Target pengguna | **Company self-service** | UI & bantuan untuk non-teknis; fitur agensi di backlog |
| AI | **AI generator di v1** (Claude API) | Wizard mengisi situs dari deskripsi company + "Tulis dengan AI" di editor; fallback preset (§4.2.1) |
| Theme bawaan | **3 theme**: Lumen, Forge, Aura | §9.2 |
| Kuota Free | Sesuai §8.3 + verifikasi email sebelum publish + laporan penyalahgunaan | §8.2 |
| Badge | **Wajib** "Dibuat dengan Fauqa One Click" | `{{ powered_by_link }}`; hanya platform admin yang bisa mematikan (§4.11) |
| Produk | Showcase saja, tanpa transaksi | CTA WhatsApp / form inquiry |
| Edit theme live | Langsung tayang saat disimpan (seperti Shopify) | Duplikat theme untuk perubahan besar |
| Konten khas company profile (tim, testimoni, klien, FAQ, dll.) | Sebagai **section + block**, bukan modul data | Lebih sedikit tabel & form admin |
| Gambar | Varian WebP dibuat saat upload (`sharp`) | Tidak bergantung image transformation berbayar |
| Email | Resend | Notifikasi form, undangan anggota, peringatan domain |

## 12. Pertanyaan terbuka

Tidak ada. Pertanyaan baru dicatat di sini saat development berjalan.
