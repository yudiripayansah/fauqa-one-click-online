// Data dummy Fase 0 (PRD §9.3) + sinkron theme bawaan dari themes/<key>/ ke DB. Aman dijalankan ulang.
// Jalankan: npm run seed   (butuh .env.local dengan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
import { readdirSync, readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { loadThemeDir, themeKeys } from './theme-files.mjs';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, opts);
const ok = ({ data, error }) => { if (error) throw error; return data; };

const PASSWORD = 'demo12345';

// 1. Theme bawaan: tambah/perbarui file, hapus file yang sudah tidak ada, naikkan builtin_version bila ada perubahan.
for (const key of themeKeys()) {
  const { text, binary } = loadThemeDir(key);
  let theme = ok(await admin.from('themes').select('id, builtin_version').is('site_id', null).eq('builtin_key', key).maybeSingle());
  const themeName = JSON.parse(text['config/settings_schema.json']).find((g) => g.theme_name)?.theme_name ?? key;
  if (!theme) theme = ok(await admin.from('themes').insert({ name: themeName, source: 'builtin', builtin_key: key, builtin_version: 1 }).select().single());
  const existing = Object.fromEntries(ok(await admin.from('theme_files').select('key, checksum').eq('theme_id', theme.id)).map((f) => [f.key, f.checksum]));
  const rows = Object.entries(text).map(([k, content]) => ({ theme_id: theme.id, key: k, content, checksum: createHash('sha1').update(content).digest('hex'), size: Buffer.byteLength(content) }));
  const changed = rows.filter((r) => existing[r.key] !== r.checksum);
  const removed = Object.keys(existing).filter((k) => !(k in text) && !(k in binary));
  if (changed.length) ok(await admin.from('theme_files').upsert(changed, { onConflict: 'theme_id,key' }));
  if (removed.length) ok(await admin.from('theme_files').delete().eq('theme_id', theme.id).in('key', removed));
  if ((changed.length || removed.length) && Object.keys(existing).length) ok(await admin.from('themes').update({ builtin_version: theme.builtin_version + 1 }).eq('id', theme.id));
  console.log(`theme ${key}: ${changed.length} file diperbarui, ${removed.length} dihapus`);
}

// 1b. Preset industri wizard dari presets/*.json.
for (const f of readdirSync(new URL('../presets/', import.meta.url))) {
  const { key, name, ...data } = JSON.parse(readFileSync(new URL(`../presets/${f}`, import.meta.url), 'utf8'));
  ok(await admin.from('industry_presets').upsert({ key, name, data, updated_at: new Date().toISOString() }));
}
console.log('preset industri disinkron');

// 2. User demo (email sudah terverifikasi).
const USERS = [
  { email: 'platform@example.com', name: 'Tim Platform', platform: true },
  { email: 'owner@example.com', name: 'Rina Owner' },
  { email: 'admin@example.com', name: 'Dimas Admin' },
  { email: 'editor@example.com', name: 'Sari Editor' },
];
const allUsers = ok(await admin.auth.admin.listUsers({ perPage: 1000 })).users;
const ids = {};
for (const u of USERS) {
  let user = allUsers.find((x) => x.email === u.email);
  if (!user) user = ok(await admin.auth.admin.createUser({ email: u.email, password: PASSWORD, email_confirm: true, user_metadata: { name: u.name } })).user;
  ids[u.email] = user.id;
  ok(await admin.from('profiles').update({ name: u.name, is_platform_admin: !!u.platform }).eq('user_id', user.id));
}

// 3. Situs contoh, dibuat lewat RPC create_site sebagai owner (alur yang sama dengan UI).
const owner = createClient(URL_, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, opts);
ok(await owner.auth.signInWithPassword({ email: 'owner@example.com', password: PASSWORD }));

const img = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=70`;
const SITES = [
  {
    slug: 'baja-nusantara', name: 'PT Baja Nusantara', industry: 'manufaktur', locales: ['id', 'en'], status: 'published', theme: 'forge',
    settings: { tagline: 'Produsen baja ringan & rangka atap sejak 2004', contact: { email: 'sales@example.com', phone: '021 555 0101', whatsapp: '6281200000001', address: 'Kawasan Industri Jababeka, Cikarang, Bekasi' } },
    hero: { heading: 'Baja ringan presisi untuk proyek skala industri', text: 'Rangka atap, hollow, dan reng bersertifikat SNI, diproduksi di pabrik kami sendiri dan dikirim ke seluruh Indonesia.', image: img('photo-1504917595217-d4dc5ebe6122') },
    about: { heading: 'Pabrik 4 hektar, kapasitas 2.000 ton per bulan', image: img('photo-1581091226825-a6a2a5aee158') },
    photos: ['photo-1504917595217-d4dc5ebe6122', 'photo-1581091226825-a6a2a5aee158', 'photo-1565008447742-97f6f38c985c', 'photo-1513828583688-c52646db42da', 'photo-1581092160562-40aa08e78837', 'photo-1590496793929-36417d3117de'],
    collections: [['rangka-atap', 'Rangka Atap', 'atap'], ['hollow', 'Hollow & Reng', 'hollow'], ['aksesoris', 'Aksesoris', null]],
    products: [
      ['Kanal C75 Baja Ringan', 'Kanal C tebal 0,75 mm untuk rangka atap rumah & gudang.', 'Mulai Rp 85.000 / batang', 'atap', [['Tebal', '0,75 mm'], ['Panjang', '6 m'], ['Lapisan', 'AZ100']]],
      ['Kanal C100 Baja Ringan', 'Untuk bentang besar pabrik dan gudang industri.', 'Mulai Rp 125.000 / batang', 'atap', [['Tebal', '1,00 mm'], ['Panjang', '6 m'], ['Lapisan', 'AZ150']]],
      ['Reng V32', 'Reng profil V tinggi 32 mm untuk genteng metal & keramik.', 'Mulai Rp 38.000 / batang', 'hollow', [['Tebal', '0,45 mm'], ['Panjang', '6 m']]],
      ['Hollow 40x40', 'Hollow galvalum untuk plafon dan partisi.', 'Mulai Rp 42.000 / batang', 'hollow', [['Ukuran', '40 × 40 mm'], ['Tebal', '0,35 mm']]],
      ['Hollow 20x40', 'Rangka plafon gypsum dan kalsiboard.', 'Mulai Rp 31.000 / batang', 'hollow', [['Ukuran', '20 × 40 mm'], ['Tebal', '0,30 mm']]],
      ['Atap Spandek 0,30', 'Lembaran atap galvalum warna untuk rumah & ruko.', 'Mulai Rp 62.000 / m', 'atap', [['Tebal', '0,30 mm'], ['Lebar efektif', '1.000 mm']]],
      ['Sekrup Roofing 12x20', 'Sekrup baja ringan dengan seal karet anti bocor.', 'Rp 95.000 / dus', null, [['Isi', '1.000 pcs']]],
      ['Bracket & Dynabolt', 'Pengikat kuda-kuda ke ring balok beton.', 'Hubungi kami', null, [['Material', 'Galvanis']]],
      ['Talang Galvalum', 'Talang air custom sesuai ukuran atap.', 'Hubungi kami', null, [['Tebal', '0,40 mm']]],
      ['Jasa Pemasangan Rangka Atap', 'Tim aplikator bersertifikat, garansi struktur 10 tahun.', 'Mulai Rp 135.000 / m²', 'atap', [['Garansi', '10 tahun'], ['Area', 'Jabodetabek']]],
      ['Kanal C75 Ekonomis', 'Pilihan hemat untuk proyek perumahan.', 'Mulai Rp 72.000 / batang', 'atap', [['Tebal', '0,65 mm']]],
      ['Hollow 50x50', 'Rangka pagar dan kanopi ringan.', 'Mulai Rp 58.000 / batang', 'hollow', [['Ukuran', '50 × 50 mm'], ['Tebal', '0,45 mm']]],
    ],
    articles: [
      ['Pabrik kedua di Karawang mulai beroperasi', 'Kapasitas produksi naik menjadi 3.500 ton per bulan.'],
      ['Cara memilih ketebalan baja ringan untuk rumah', 'Panduan singkat agar rangka atap kuat dan tetap hemat.'],
      ['Baja Nusantara raih sertifikat SNI 8399:2017', 'Seluruh kanal C kini tersertifikasi SNI terbaru.'],
      ['Tips merawat atap spandek agar tidak bocor', 'Lima langkah sederhana setiap musim hujan.'],
      ['Kunjungan mahasiswa teknik sipil ke pabrik', 'Belajar langsung proses roll forming baja ringan.'],
      ['Harga baja ringan kuartal IV 2026', 'Ringkasan pergerakan harga bahan baku dan proyeksinya.'],
    ],
    pages: [['tentang-kami', 'Tentang Kami', '<p>PT Baja Nusantara berdiri sejak 2004 di Cikarang dan melayani kontraktor, developer, serta toko bangunan di 28 provinsi.</p><h2>Visi</h2><p>Menjadi produsen baja ringan pilihan utama untuk konstruksi yang aman dan efisien.</p>'],
      ['kontak', 'Kontak', '<p>Kantor & pabrik: Kawasan Industri Jababeka, Cikarang.</p><p>Telepon 021 555 0101 · sales@example.com</p>'],
      ['kebijakan-privasi', 'Kebijakan Privasi', '<p>Kami hanya memakai data yang Anda kirim lewat formulir untuk menjawab pertanyaan Anda.</p>']],
  },
  {
    slug: 'prima-konsultan', name: 'Prima Konsultan', industry: 'jasa', locales: ['id'], status: 'published', theme: 'lumen',
    settings: { tagline: 'Konsultan pajak & keuangan untuk UMKM', contact: { email: 'halo@example.com', phone: '0812 0000 0002', address: 'Jl. Sudirman No. 12, Jakarta' } },
    hero: { heading: 'Laporan pajak beres, Anda fokus mengembangkan bisnis', text: 'Pendampingan pajak, pembukuan, dan perencanaan keuangan oleh konsultan bersertifikat.', image: img('photo-1554224155-6726b3ff858f') },
    about: { heading: 'Dipercaya 300+ UMKM di Jabodetabek', image: img('photo-1521737604893-d14cc237f11d') },
    photos: ['photo-1554224155-6726b3ff858f', 'photo-1521737604893-d14cc237f11d', 'photo-1450101499163-c8848c66ca85', 'photo-1556761175-b413da4baf72', 'photo-1600880292203-757bb62b4baf', 'photo-1573497019940-1c28c88b4f3e'],
    collections: [['pajak', 'Layanan Pajak', 'pajak'], ['akuntansi', 'Akuntansi & Pembukuan', 'akuntansi'], ['paket', 'Paket UMKM', null]],
    products: [
      ['Pelaporan SPT Tahunan Badan', 'Penyusunan & pelaporan SPT Tahunan PPh Badan tepat waktu.', 'Mulai Rp 2,5 jt', 'pajak', [['Durasi', '7 hari kerja']]],
      ['Pelaporan SPT Masa', 'PPh 21, 23, 4(2), dan PPN setiap bulan.', 'Mulai Rp 750 rb / bulan', 'pajak', [['Durasi', 'Bulanan']]],
      ['Pendampingan Pemeriksaan Pajak', 'Kami dampingi dari SP2DK sampai keberatan.', 'Hubungi kami', 'pajak', [['Tim', 'Kuasa hukum pajak']]],
      ['Tax Planning', 'Perencanaan pajak legal untuk efisiensi bisnis.', 'Hubungi kami', 'pajak', []],
      ['Pembukuan Bulanan', 'Laporan keuangan rapi setiap bulan, siap untuk bank.', 'Mulai Rp 1,2 jt / bulan', 'akuntansi', [['Laporan', 'Neraca, laba rugi, arus kas']]],
      ['Audit Internal', 'Evaluasi kontrol keuangan dan risiko kecurangan.', 'Hubungi kami', 'akuntansi', []],
      ['Penyusunan Laporan Keuangan', 'Laporan keuangan sesuai SAK EMKM / SAK ETAP.', 'Mulai Rp 3 jt', 'akuntansi', []],
      ['Setup Software Akuntansi', 'Implementasi Accurate / Jurnal beserta pelatihan.', 'Mulai Rp 4 jt', 'akuntansi', []],
      ['Paket UMKM Starter', 'Pembukuan + SPT Masa untuk usaha omzet < 4,8 M.', 'Rp 1,5 jt / bulan', null, []],
      ['Paket UMKM Growth', 'Starter + konsultasi bulanan + laporan untuk investor.', 'Rp 3 jt / bulan', null, []],
      ['Pendirian PT & Perizinan', 'Akta, NIB, NPWP badan, sampai PKP.', 'Mulai Rp 6 jt', null, []],
      ['Konsultasi Per Jam', 'Tanya jawab langsung dengan konsultan bersertifikat.', 'Rp 500 rb / jam', null, []],
    ],
    articles: [
      ['Batas lapor SPT Tahunan Badan 2026', 'Jangan sampai terlambat: jadwal dan sanksinya.'],
      ['PPh Final UMKM 0,5% berakhir, lalu apa?', 'Pilihan skema pajak setelah masa berlaku habis.'],
      ['5 kesalahan pembukuan yang sering terjadi', 'Dan cara mudah menghindarinya.'],
      ['Coretax: apa yang berubah untuk wajib pajak', 'Panduan singkat sistem administrasi pajak baru.'],
      ['Kapan usaha perlu dikukuhkan PKP?', 'Batas omzet dan konsekuensinya.'],
      ['Prima Konsultan buka kantor di Bekasi', 'Melayani klien di wilayah timur Jakarta.'],
    ],
    pages: [['tentang-kami', 'Tentang Kami', '<p>Prima Konsultan didirikan oleh konsultan pajak bersertifikat dengan pengalaman lebih dari 15 tahun.</p>'],
      ['kontak', 'Kontak', '<p>Jl. Sudirman No. 12, Jakarta · halo@example.com</p>']],
  },
  {
    slug: 'kopi-senja', name: 'Kopi Senja', industry: 'fnb', locales: ['id'], status: 'draft', theme: 'aura',
    settings: { tagline: 'Kopi susu & roti bakar di Bandung', contact: { email: 'kopi@example.com', whatsapp: '6281200000003', address: 'Jl. Braga No. 5, Bandung' } },
    hero: { heading: 'Kopi susu gula aren, diseduh setiap pagi', text: 'Biji kopi dari petani Gunung Puntang, dipanggang sendiri setiap minggu.', image: img('photo-1495474472287-4d71bcdd2085') },
    about: { heading: 'Tempat ngopi sejak 2019', image: img('photo-1554118811-1e0d58224f24') },
    photos: ['photo-1495474472287-4d71bcdd2085', 'photo-1554118811-1e0d58224f24', 'photo-1509042239860-f550ce710b93', 'photo-1461023058943-07fcbe16d735', 'photo-1517701604599-bb29b565090c', 'photo-1559925393-8be0ec4767c8'],
    collections: [['kopi', 'Kopi', 'kopi'], ['non-kopi', 'Non-kopi', 'non-kopi'], ['makanan', 'Makanan', null]],
    products: [
      ['Kopi Susu Gula Aren', 'Espresso, susu segar, dan gula aren Banten.', 'Rp 22.000', 'kopi', [['Ukuran', '350 ml']]],
      ['Americano', 'Espresso single origin Puntang dengan air panas.', 'Rp 20.000', 'kopi', []],
      ['Cappuccino', 'Espresso dengan busa susu lembut.', 'Rp 26.000', 'kopi', []],
      ['V60 Manual Brew', 'Seduh manual, pilih biji sesuai stok mingguan.', 'Rp 28.000', 'kopi', []],
      ['Es Kopi Senja', 'Signature: kopi susu dengan krim kelapa.', 'Rp 27.000', 'kopi', []],
      ['Matcha Latte', 'Matcha Jepang dengan susu segar.', 'Rp 28.000', 'non-kopi', []],
      ['Coklat Panas', 'Coklat Bali 70% dengan susu.', 'Rp 25.000', 'non-kopi', []],
      ['Teh Lemon Serai', 'Teh hitam, lemon, dan serai segar.', 'Rp 18.000', 'non-kopi', []],
      ['Roti Bakar Coklat Keju', 'Roti tebal panggang arang dengan coklat & keju.', 'Rp 24.000', null, []],
      ['Pisang Goreng Madu', 'Pisang kepok goreng renyah dengan madu hutan.', 'Rp 20.000', null, []],
      ['Croissant Butter', 'Croissant butter dipanggang setiap pagi.', 'Rp 23.000', null, []],
      ['Biji Kopi Puntang 200 g', 'Roast medium, cocok untuk V60 & tubruk.', 'Rp 95.000', 'kopi', [['Berat', '200 g'], ['Roast', 'Medium']]],
    ],
    articles: [
      ['Menu baru: Es Kopi Senja', 'Signature terbaru dengan krim kelapa.'],
      ['Mengenal petani kopi Gunung Puntang', 'Cerita di balik biji kopi kami.'],
      ['Jadwal live music akhir pekan', 'Akustik setiap Sabtu malam.'],
      ['Cara menyeduh V60 di rumah', 'Resep sederhana 1:15.'],
      ['Kopi Senja kini buka sampai jam 11 malam', 'Jam operasional baru mulai bulan ini.'],
      ['Promo ulang tahun ke-7', 'Diskon 20% semua minuman sepanjang minggu.'],
    ],
    pages: [['tentang-kami', 'Tentang Kami', '<p>Kopi Senja berawal dari gerobak kecil di Jalan Braga.</p>'], ['kontak', 'Kontak', '<p>Jl. Braga No. 5, Bandung.</p>']],
  },
];

// File contoh: foto Unsplash (diunduh sekali) + brosur PDF, diunggah seperti lewat file manager (varian WebP).
const photoCache = new Map();
async function photo(id) {
  if (!photoCache.has(id)) {
    const res = await fetch(`https://images.unsplash.com/${id}?auto=format&fit=crop&w=1920&q=75`);
    if (!res.ok) throw new Error(`Unduh foto ${id}: ${res.status}`);
    photoCache.set(id, Buffer.from(await res.arrayBuffer()));
  }
  return photoCache.get(id);
}
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

async function addFile(siteId, { name, folder = '', buf, mime, alt = '' }) {
  const id = randomUUID();
  const dir = `${siteId}/${id}`;
  const key = `${dir}/${name.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}`;
  const variants = {};
  let width = null;
  let height = null;
  if (mime.startsWith('image/')) {
    ({ width, height } = await sharp(buf).metadata());
    for (const w of [400, 800, 1200, 1920].filter((x) => x <= width)) {
      variants[w] = `${dir}/${w}.webp`;
      ok(await admin.storage.from('site-files').upload(variants[w], await sharp(buf).resize({ width: w }).webp({ quality: 80 }).toBuffer(), { contentType: 'image/webp', cacheControl: '31536000' }));
    }
  }
  ok(await admin.storage.from('site-files').upload(key, buf, { contentType: mime, cacheControl: '31536000' }));
  return ok(await admin.from('files').insert({ id, site_id: siteId, folder, name, storage_path: key, mime, size: buf.length, width, height, variants, alt }).select().single());
}

const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString();
const SENDERS = [['Budi Santoso', 'budi@example.com'], ['Ani Wijaya', 'ani@example.com'], ['Rudi Hartono', 'rudi@example.com'], ['Siti Rahma', 'siti@example.com'], ['Hendra Gunawan', 'hendra@example.com'], ['Maya Putri', 'maya@example.com']];

for (const s of SITES) {
  // Hapus situs lama beserta file Storage-nya.
  const old = ok(await admin.from('sites').select('id').eq('slug', s.slug).maybeSingle());
  if (old) {
    const files = ok(await admin.from('files').select('storage_path, variants').eq('site_id', old.id));
    const paths = files.flatMap((f) => [f.storage_path, ...Object.values(f.variants ?? {})]);
    if (paths.length) ok(await admin.storage.from('site-files').remove(paths));
    ok(await admin.from('sites').delete().eq('id', old.id));
  }
  const siteId = ok(await owner.rpc('create_site', { p_name: s.name, p_slug: s.slug, p_industry: s.industry, p_locale: 'id', p_theme: s.theme }));
  ok(await admin.from('sites').update({ status: s.status, locales: s.locales, settings: s.settings }).eq('id', siteId));
  ok(await admin.from('site_members').insert([
    { site_id: siteId, user_id: ids['admin@example.com'], role: 'admin' },
    { site_id: siteId, user_id: ids['editor@example.com'], role: 'editor' },
  ]));

  const photos = [];
  for (const [i, pid] of s.photos.entries()) photos.push(await addFile(siteId, { name: `foto-${i + 1}.jpg`, folder: 'produk', buf: await photo(pid), mime: 'image/jpeg', alt: `${s.name} — foto ${i + 1}` }));
  const brochure = await addFile(siteId, { name: `brosur-${s.slug}.pdf`, folder: 'dokumen', buf: PDF, mime: 'application/pdf' });

  // Beranda: hero & gambar+teks memakai file dari file manager.
  const { live_theme_id } = ok(await admin.from('sites').select('live_theme_id').eq('id', siteId).single());
  const file = ok(await admin.from('theme_files').select('content').eq('theme_id', live_theme_id).eq('key', 'templates/index.json').single());
  const tpl = JSON.parse(file.content);
  Object.assign(tpl.sections.hero.settings, s.hero, { image: 'files/foto-1.jpg', image_alt: s.name });
  Object.assign(tpl.sections.about.settings, s.about, { image: 'files/foto-2.jpg', image_alt: s.name });
  // Galeri (Aura) memakai foto berikutnya.
  for (const [i, b] of Object.values(tpl.sections.gallery?.blocks ?? {}).entries()) b.settings.image = `files/foto-${i + 3}.jpg`;
  ok(await admin.from('theme_files').update({ content: JSON.stringify(tpl, null, 2) }).eq('theme_id', live_theme_id).eq('key', 'templates/index.json'));

  ok(await admin.from('pages').delete().eq('site_id', siteId));
  ok(await admin.from('pages').insert(s.pages.map(([handle, title, body]) => ({ site_id: siteId, handle, title, body, status: 'published', published_at: daysAgo(30),
    template_suffix: handle === 'kontak' ? 'contact' : null }))));

  // Produk, koleksi (tag otomatis + 1 manual), produk terkait.
  const products = ok(await admin.from('products').insert(s.products.map(([title, summary, price, tag, specs], i) => ({
    site_id: siteId, title, summary, price_label: price, handle: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    body: `<p>${summary}</p><p>Hubungi tim kami untuk konsultasi gratis, pengiriman, dan penawaran proyek.</p>`,
    media: [photos[i % photos.length].id, photos[(i + 1) % photos.length].id], downloads: i < 3 ? [brochure.id] : [],
    specs: specs.map(([label, value]) => ({ label, value })), tags: tag ? [tag] : [],
    cta: { type: i % 3 === 1 && s.settings.contact.whatsapp ? 'whatsapp' : 'inquiry' }, status: 'published', position: i, created_at: daysAgo(60 - i),
  }))).select('id, tags'));
  for (let i = 0; i < 3; i++) ok(await admin.from('products').update({ related_ids: [products[i + 1].id, products[i + 2].id] }).eq('id', products[i].id));
  for (const [i, [handle, title, tag]] of s.collections.entries()) {
    const col = ok(await admin.from('collections').insert({ site_id: siteId, handle, title, rule: tag ? 'tag' : 'manual', rule_tag: tag, image: photos[i].id, position: i, body: `<p>Pilihan ${title.toLowerCase()} dari ${s.name}.</p>` }).select('id').single());
    if (!tag) ok(await admin.from('collection_products').insert(products.filter((p) => !p.tags.length).map((p, j) => ({ collection_id: col.id, product_id: p.id, position: j }))));
  }

  // Artikel di blog "Berita" (dibuat create_site); artikel terakhir terjadwal 3 hari lagi.
  const blog = ok(await admin.from('blogs').select('id').eq('site_id', siteId).eq('handle', 'berita').single());
  ok(await admin.from('articles').insert(s.articles.map(([title, excerpt], i) => ({
    site_id: siteId, blog_id: blog.id, title, excerpt, author: 'Tim Redaksi', cover: photos[(i + 2) % photos.length].id, status: 'published',
    handle: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70),
    body: `<p>${excerpt}</p><h2>Selengkapnya</h2><p>${s.name} terus berkomitmen memberikan yang terbaik bagi pelanggan.</p>`,
    published_at: i === s.articles.length - 1 ? daysAgo(-3) : daysAgo(4 + i * 9),
  }))));

  // Kiriman form (±8 per situs, termasuk spam) dan redirect dari website lama.
  ok(await admin.from('form_submissions').insert(Array.from({ length: 9 }, (_, i) => {
    const [name, email] = SENDERS[i % SENDERS.length];
    const spam = i === 8;
    return {
      site_id: siteId, form_type: i % 3 === 2 ? 'inquiry' : 'contact', product_id: i % 3 === 2 ? products[i].id : null,
      fields: spam ? { name: 'SEO Expert', email: 'seo@spam.example.com', body: 'Cheap backlinks!!! Visit now' }
        : { name, email, phone: `0812${String(1000000 + i * 7919).slice(0, 7)}`, body: i % 3 === 2 ? `Mohon penawaran untuk ${s.products[i][0]}, kebutuhan sekitar ${(i + 1) * 10} unit.` : 'Halo, saya ingin bertanya mengenai layanan dan jadwal konsultasi.' },
      page_path: i % 3 === 2 ? `/products/${s.products[i][0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '/pages/kontak',
      status: spam ? 'spam' : ['new', 'new', 'read', 'done'][i % 4], locale: 'id', created_at: daysAgo(i * 2.5),
    };
  })));
  ok(await admin.from('redirects').insert([
    { site_id: siteId, from_path: '/about-us', to_url: '/pages/tentang-kami' },
    { site_id: siteId, from_path: '/produk.php', to_url: '/collections/all' },
  ]));
  console.log(`situs ${s.slug} (${s.status}): ${products.length} produk, ${s.articles.length} artikel, ${photos.length + 1} file`);
}

console.log(`\nSelesai. Login: owner@example.com / admin@example.com / editor@example.com / platform@example.com — password ${PASSWORD}`);
