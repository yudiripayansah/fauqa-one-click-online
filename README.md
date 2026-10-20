# Fauqa One Click

Platform website company profile multi-tenant dengan theme Liquid bergaya Shopify. Spesifikasi lengkap: [PRD.md](PRD.md).

## Menjalankan

1. `cp .env.example .env.local`, isi kunci Supabase dan `PREVIEW_SECRET` (`openssl rand -hex 32`).
2. Terapkan migrasi `supabase/migrations/*.sql` berurutan ke project Supabase.
3. `npm run seed` — theme bawaan (`themes/`) dan preset industri (`presets/`) ke DB, user demo, 3 situs contoh. Aman dijalankan ulang.
4. `npm run dev`, lalu buka:
   - Admin: http://app.localhost:3000 (`owner@example.com` / `demo12345`)
   - Situs: http://baja-nusantara.localhost:3000, http://prima-konsultan.localhost:3000 (kopi-senja masih draft → buka lewat tombol "Lihat situs" di admin)

`npm run check` menguji migrasi (RLS, RPC) di PGlite dan render theme dari disk, tanpa database sungguhan.

## Deploy (Vercel)

- Env: `ROOT_DOMAIN=oneclick.fau-qa.com`, `PROTOCOL=https` (+ kunci di `.env.example`).
- Domain di project Vercel: `oneclick.fau-qa.com`, `app.oneclick.fau-qa.com`, `*.oneclick.fau-qa.com`.
- Wildcard SSL butuh DNS di Vercel: delegasikan subdomain `oneclick` dengan record NS ke `ns1.vercel-dns.com` & `ns2.vercel-dns.com` bila DNS `fau-qa.com` ada di tempat lain.
- Turnstile (opsional): daftarkan hostname `oneclick.fau-qa.com`. Widget hanya dipasang di subdomain platform; custom domain tenant memakai honeypot + rate limit.
- Custom domain: isi `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` (+ `VERCEL_TEAM_ID` bila project milik team) dan `CRON_SECRET`. Cron cek DNS di `vercel.json` berjalan tiap 15 menit (butuh Vercel Pro; Hobby hanya harian).
- AI generator (opsional): `ANTHROPIC_API_KEY`. Tanpa kunci, wizard memakai teks preset industri.

## Struktur

| Path | Isi |
|---|---|
| `proxy.js` | Routing host: `app.` → admin, domain induk → landing (`/`) & `/docs/theme`, `<slug>.` / custom domain → `/site/<host>/…` |
| `lib/theme/engine.js` | Engine Liquid: template JSON, section + schema + block, section group, filter & tag |
| `lib/theme/site.js` | Routing URL situs, objek global Liquid, SEO, badge |
| `lib/site/data.js` | Loader data situs (service role) + cache (`site:<id>`) |
| `app/site/[host]/…` | Route render situs & aset theme |
| `app/s/[site]/…` | Admin per situs: halaman, produk, koleksi, blog, menu, form, file, redirect, anggota |
| `lib/files.js` | Validasi isi file, varian WebP (`sharp`), sanitasi SVG, cek pemakaian file |
| `lib/theme/bridge.js`, `lib/theme/sanitize.js` | Skrip jembatan preview editor; validasi nilai setting terhadap schema saat simpan |
| `components/editor/` | Theme editor visual (state, daftar section dnd-kit, form setting) |
| `lib/site/contact.js` | `POST /contact`: honeypot, Turnstile, rate limit, email Resend |
| `themes/_shared/` | Section, snippet, template, locale, `sections.css` yang dipakai semua theme bawaan |
| `presets/*.json` | Preset industri wizard (teks contoh ID/EN, produk, artikel); disinkron ke tabel `industry_presets` oleh `npm run seed` |
| `lib/preset.js`, `lib/ai.js` | Isi situs baru dari preset / Claude API (fallback ke preset) |
| `lib/translate.js` | Katalog teks yang bisa diterjemahkan (konten, menu, teks section theme) |
| `lib/domains.js`, `app/api/cron/domains` | Vercel Domains API, instruksi DNS, cron 15 menit (DNS, alias, jadwal terbit) |
| `lib/site/analytics.js`, `lib/analytics-report.js`, `app/api/cron/harian` | Analytics: script & `/api/collect`, laporan dashboard, cron rollup/retensi/pembersihan |
| `app/platform/` | Platform admin (`profiles.is_platform_admin`) |
| `themes/<key>/` | Layout, header/footer/hero, `base.css`, settings & preset tiap theme; digabung dengan `_shared` oleh `npm run seed` |
| `lib/theme/validate.js`, `lib/theme/zip.js` | Validator theme (PRD §6.7) & pembaca ZIP |

## Progres

| Fase | Status |
|---|---|
| 0. Fondasi | ✅ Kode selesai: auth (`__Host-` cookie), situs & anggota + undangan, site switcher, proxy multi-host, tabel theme/file, engine Liquid, theme Lumen (layout + header/footer group + hero, multikolom, gambar+teks, teks, banner ajakan, halaman, 404), render index & page, preview draft bertoken, seed |
| 1. Konten & file | ✅ Selesai: halaman (jadwal terbit, template alternatif), produk showcase (galeri, spesifikasi, harga tampil, CTA WhatsApp/form/link, unduhan, terkait), koleksi manual/tag, blog & artikel, menu 3 level, file manager (folder, unggah banyak, varian WebP, alt text, dipakai di mana, kuota), form kontak/inquiry + inbox + CSV + email, SEO (sitemap, robots, canonical, OG, JSON-LD Product/Article/Breadcrumb), redirect 301 + impor CSV, pencarian full-text |
| 2. Theme editor | ✅ Selesai: editor visual (`/editor/<situs>/<theme>`): section group + template, drag-and-drop section/block (dnd-kit, bisa keyboard), tambah dari presets (hormati `limit`, `max_blocks`, `enabled_on`/`disabled_on`), sembunyikan/duplikat/hapus, form setting otomatis semua tipe PRD §6.4, theme settings + preset gaya, live preview (Section Rendering API `/api/render-section` + bridge, event `fauqa:section:*`), klik di preview memilih section/block, template switcher + buat template alternatif, desktop/tablet/mobile, undo/redo, deteksi konflik, peringatan belum disimpan. Theme library: publish, duplikat, ganti nama, hapus, tambah theme bawaan, preview theme tersimpan |
| 3. Kode & paket theme | ✅ Selesai: edit kode di browser (Monaco, Liquid/JSON/CSS/JS, validasi sintaks + nomor baris, riwayat 20 versi + muat ulang versi, file baru/ganti nama/hapus, unggah aset biner ke Storage), download & upload .zip + validator PRD §6.7 (struktur, ekstensi, path traversal, Liquid, JSON, schema, file wajib, section hilang, peringatan input password), theme bawaan PRD **Lumen · Forge · Aura** + 10 theme starter dari panduan *76 Design Style* (Raster/Swiss, Warta/Editorial Serif, Aurum/Luxury, Bento/Bento Grid, Blok/Neobrutalism, Konsol/Dark+Monospace, Rimba/Biophilic, Sejuk/Soft Shadow+Pastel, Bentuk/Bauhaus, Deco/Art Deco) — masing-masing 3 preset gaya dengan kontras WCAG AA, 32 section (semua section PRD §9.2 + custom Liquid + halaman password) |
| 4. One click & publish | ✅ Selesai (kecuali "Tulis dengan AI" di editor, menunggu API key): pengaturan situs (umum, kontak, SEO, bahasa, password situs, kode `<head>`, hapus + pulihkan 30 hari), wizard 5 langkah + 8 preset industri ID/EN + checklist "Siap publish", AI generator situs (Claude, fallback preset; belum diuji tanpa API key), multi-bahasa (`/en/…`, halaman Terjemahan termasuk teks section theme), custom domain (Vercel, instruksi DNS, cron, domain utama + 301, ganti subdomain + redirect 30 hari), Turnstile hanya di subdomain platform, verifikasi email sebelum publish, tampilan kuota, **landing page** di domain induk (demo 13 theme, `?ref=`), dokumentasi developer theme (`/docs/theme`) |
| 5. Analytics & platform | 🟡 Kode selesai, menunggu uji browser: analytics tanpa cookie (script 0,8 KB, event otomatis + `data-fauqa-event`, dashboard rentang/perbandingan/realtime/CSV, rollup harian + retensi 90 hari, partisi bulanan), ringkasan 7 hari + form terbaru di Beranda, integrasi GA4/Pixel/GTM/Search Console + banner cookie, laporan penyalahgunaan (`/laporkan` dari badge), platform admin `/platform` (situs + suspend, laporan, theme bawaan, preset, plan & kuota, log audit), ekspor situs (.zip), email undangan anggota, cron harian (hapus permanen situs > 30 hari, spam > 30 hari) & jadwal terbit tepat waktu |

Ditunda dengan sengaja:
- "Tulis dengan AI" di editor (menunggu `ANTHROPIC_API_KEY`).
- Ekspor situs belum menyertakan file media di dalam .zip (bisa sampai 1 GB); `files.csv` berisi URL publiknya.
