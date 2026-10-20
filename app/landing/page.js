// Landing page di domain induk (oneclick.fau-qa.com). proxy.js me-rewrite '/' host induk ke sini.
import { Suspense } from 'react';
import { cacheLife } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { APP_URL } from '@/lib/hosts';
import { Brand } from '@/components/admin/AuthShell';
import Demo from './Demo';

export const metadata = {
  title: { absolute: 'Fauqa One Click: website company profile dalam 10 menit' },
  description: 'Buat website company profile lengkap dengan halaman, produk, blog, form kontak, dua bahasa, dan domain sendiri. Pilih industri dan theme, konten contoh langsung terisi.',
  robots: { index: true, follow: true },
};

// Theme bawaan (preset gaya pertama) + judul hero contoh per industri. Data publik, di-cache per jam.
async function loadDemo() {
  'use cache';
  cacheLife('hours');
  const db = createAdminClient();
  const [{ data: themes }, { data: presets }] = await Promise.all([
    db.from('themes').select('builtin_key, name, theme_files (content)').is('site_id', null).eq('theme_files.key', 'config/settings_data.json'),
    db.from('industry_presets').select('key, name, data->id->hero, data->id->tagline'),
  ]);
  const first = ['lumen', 'forge', 'aura'];
  return {
    themes: (themes ?? []).map((t) => {
      const data = JSON.parse(t.theme_files[0]?.content ?? '{}');
      const p = Object.values(data.presets ?? {})[0] ?? {};
      return { key: t.builtin_key, name: t.name, ...p };
    }).sort((a, b) => (first.indexOf(a.key) + 1 || 99) - (first.indexOf(b.key) + 1 || 99) || a.name.localeCompare(b.name)),
    industries: (presets ?? []).sort((a, b) => (a.key === 'umum') - (b.key === 'umum') || a.name.localeCompare(b.name))
      .map((p) => ({ key: p.key, name: p.name, heading: p.hero?.heading ?? '', text: p.hero?.text ?? '', cta: p.hero?.cta ?? '' })),
  };
}

const signup = (ref) => `${APP_URL}/daftar${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`;

const STEPS = [
  ['Daftar dengan email', 'Tanpa kartu kredit. Verifikasi email, lalu wizard langsung terbuka.'],
  ['Isi nama, industri, dan pilih tampilan', 'Halaman Tentang Kami, Kontak, Kebijakan Privasi, produk, dan dua artikel terisi teks contoh sesuai industri Anda.'],
  ['Ganti teks contoh, lalu publish', 'Checklist di dashboard menunjukkan apa yang masih perlu diganti sebelum situs dibuka untuk umum.'],
];

const FEATURES = [
  ['Editor visual', 'Susun section beranda dengan drag-and-drop dan lihat hasilnya langsung, seperti theme editor Shopify.'],
  ['Produk & layanan', 'Katalog dengan foto, spesifikasi, label harga, brosur PDF, tombol WhatsApp, dan form minta penawaran.'],
  ['Dua bahasa', 'Bahasa Indonesia dan English. Versi kedua tampil di /en, teks yang belum diterjemahkan memakai bahasa utama.'],
  ['Domain sendiri', 'Hubungkan domain .co.id atau .com. SSL dipasang otomatis; subdomain gratis tetap tersedia.'],
  ['Form & notifikasi', 'Pesan pengunjung masuk ke inbox dan email Anda, terlindung dari spam.'],
  ['SEO dasar', 'Sitemap, meta, Open Graph, dan data terstruktur Google dibuat otomatis untuk setiap halaman.'],
  ['Tim', 'Undang admin dan editor. Editor mengelola konten tanpa bisa mengubah domain atau kode.'],
  ['Untuk developer', 'Theme memakai Liquid seperti Shopify. Edit kode di browser, atau unduh dan unggah theme sebagai .zip.'],
];

const FAQ = [
  ['Apakah gratis?', 'Ya. Paket Free mencakup 100 halaman, 500 produk, 500 artikel, 1 GB file, dan 2 custom domain. Situs menampilkan tautan kecil "Dibuat dengan Fauqa One Click".'],
  ['Perlu bisa coding?', 'Tidak. Semua diatur lewat formulir dan editor visual. Kode theme hanya untuk yang ingin mengubah tampilan lebih jauh.'],
  ['Bisa pakai domain yang sudah saya punya?', 'Bisa. Tambahkan domain di Pengaturan → Domain, lalu buat record DNS yang ditampilkan di sana. Status dicek otomatis.'],
  ['Bisa ganti tampilan setelah situs jadi?', 'Bisa kapan saja. Konten tersimpan terpisah dari theme, jadi berganti theme tidak menghapus halaman dan produk Anda.'],
  ['Apakah situs bisa dikunci sebelum diluncurkan?', 'Bisa. Situs tetap draft sampai Anda klik Publish, atau publish dengan password untuk soft-launch.'],
];

async function Page({ searchParams }) {
  const { ref } = await searchParams;
  const safeRef = /^[a-z0-9-]{1,40}$/.test(ref ?? '') ? ref : 'landing';
  const demo = await loadDemo();
  const cta = signup(safeRef);
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Brand />
        <nav aria-label="Akun" className="flex items-center gap-2 text-sm">
          <a href={`${APP_URL}/login`} className="rounded-lg px-3 py-2 font-medium text-muted hover:text-ink">Masuk</a>
          <a href={cta} className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink hover:opacity-90">Daftar gratis</a>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pt-10 pb-16 sm:px-6 md:pt-16">
          <h1 className="max-w-3xl text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-6xl">Website company profile Anda, siap dalam 10 menit.</h1>
          <p className="mt-5 max-w-2xl text-lg text-muted">Ketik nama perusahaan dan pilih industri. Halaman, produk, dan teks contoh langsung terisi; Anda tinggal menyesuaikan lalu publish.</p>
          <Demo themes={demo.themes} industries={demo.industries} cta={cta} />
        </section>

        <section aria-labelledby="cara" className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_2fr]">
            <h2 id="cara" className="text-3xl font-extrabold tracking-tight">Cara kerjanya</h2>
            <ol className="space-y-8">
              {STEPS.map(([title, text], i) => (
                <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-4">
                  <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-accent text-lg font-bold text-accent-ink">{i + 1}</span>
                  <div><h3 className="text-lg font-bold">{title}</h3><p className="mt-1 text-muted">{text}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="fitur" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 id="fitur" className="text-3xl font-extrabold tracking-tight">Yang sudah termasuk</h2>
          <dl className="mt-10 grid gap-x-12 gap-y-8 sm:grid-cols-2">
            {FEATURES.map(([title, text]) => (
              <div key={title} className="border-t border-line pt-4">
                <dt className="font-bold">{title}</dt>
                <dd className="mt-1 text-muted">{text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="faq" className="border-t border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1fr_2fr]">
            <h2 id="faq" className="text-3xl font-extrabold tracking-tight">Pertanyaan umum</h2>
            <div className="divide-y divide-line border-y border-line">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                    {q}<span aria-hidden="true" className="text-xl text-muted transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 text-muted">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Mulai sekarang, publish hari ini.</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">Gratis, tanpa kartu kredit. Situs tetap draft sampai Anda siap.</p>
          <a href={cta} className="mt-8 inline-block rounded-lg bg-accent px-6 py-3 font-semibold text-accent-ink hover:opacity-90">Buat website gratis</a>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-6">
          <span>© {new Date().getFullYear()} Fauqa One Click</span>
          <nav aria-label="Tautan" className="flex gap-5">
            <a href="/docs/theme" className="hover:text-ink">Dokumentasi theme</a>
            <a href={`${APP_URL}/login`} className="hover:text-ink">Masuk</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export default function Landing({ searchParams }) {
  return <Suspense fallback={<div className="min-h-dvh" />}><Page searchParams={searchParams} /></Suspense>;
}
