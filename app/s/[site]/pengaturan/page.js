import { Suspense } from 'react';
import Link from 'next/link';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { fileRefs } from '@/lib/files';
import { TIMEZONES } from '@/lib/tz';
import { Card, Field, PageHeader, TableSkeleton, btn, inputCls } from '@/components/admin/ui';
import { SubmitButton } from '@/components/admin/client';
import { FilePicker } from '@/components/admin/editors';
import { deleteSite, saveAdvanced, saveContact, saveGeneral, saveIntegrations, saveLanguages, saveSeo } from './actions';

export const metadata = { title: 'Pengaturan' };

const TABS = [['umum', 'Umum'], ['kontak', 'Kontak & sosial'], ['seo', 'SEO'], ['bahasa', 'Bahasa'], ['integrasi', 'Integrasi'], ['lanjutan', 'Lanjutan'], ['ekspor', 'Ekspor'], ['hapus', 'Hapus situs']];
const SOCIAL = [['instagram', 'Instagram'], ['facebook', 'Facebook'], ['linkedin', 'LinkedIn'], ['youtube', 'YouTube'], ['tiktok', 'TikTok'], ['x', 'X / Twitter']];

function Form({ action, slug, children, submit = 'Simpan' }) {
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="site" value={slug} />
      {children}
      <SubmitButton>{submit}</SubmitButton>
    </form>
  );
}

async function Settings({ params, searchParams }) {
  const [{ site: slug }, { tab = 'umum' }] = await Promise.all([params, searchParams]);
  const { site } = await requireSite(slug, ['owner', 'admin']);
  const supabase = await createClient();
  const { data: row } = await supabase.from('sites').select('name, default_locale, locales, settings, password_hash').eq('id', site.id).single();
  const s = row.settings ?? {};
  const [logo, favicon, seoImage] = await Promise.all([s.logo_file, s.favicon_file, s.seo?.image_file].map((id) => fileRefs(supabase, site.id, id ? [id] : [])));

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Pengaturan" />
      <nav aria-label="Bagian pengaturan" className="flex flex-wrap gap-1">
        {TABS.filter(([k]) => k !== 'hapus' || site.role === 'owner').map(([k, l]) => (
          <Link key={k} href={`/s/${slug}/pengaturan?tab=${k}`} aria-current={tab === k ? 'page' : undefined}
            className="rounded-full border border-line px-3 py-1 text-sm text-muted aria-[current=page]:border-accent aria-[current=page]:bg-accent-tint aria-[current=page]:text-accent">{l}</Link>
        ))}
      </nav>

      {tab === 'umum' && (
        <Card>
          <Form action={saveGeneral} slug={slug}>
            <Field label="Nama situs" name="name"><input id="name" name="name" required maxLength={120} defaultValue={row.name} className={inputCls} /></Field>
            <Field label="Tagline" name="tagline" hint="Satu kalimat tentang perusahaan, tampil di footer & mesin pencari."><input id="tagline" name="tagline" maxLength={200} defaultValue={s.tagline} className={inputCls} /></Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <div><span className="block text-sm font-medium">Logo</span><div className="mt-1.5"><FilePicker name="logo" site={slug} kind="image" defaultFiles={logo} label="Pilih logo" /></div></div>
              <div><span className="block text-sm font-medium">Favicon</span><div className="mt-1.5"><FilePicker name="favicon" site={slug} kind="image" defaultFiles={favicon} label="Pilih favicon" /></div>
                <p className="mt-1.5 text-xs text-muted">Gambar persegi, minimal 64×64 px.</p></div>
            </div>
            <Field label="Zona waktu" name="timezone" hint="Dipakai untuk jadwal terbit halaman & artikel.">
              <select id="timezone" name="timezone" defaultValue={s.timezone ?? 'Asia/Jakarta'} className={inputCls}>
                {TIMEZONES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          </Form>
        </Card>
      )}

      {tab === 'kontak' && (
        <Card description="Tampil di footer, halaman kontak, tombol WhatsApp produk, dan data terstruktur Google.">
          <Form action={saveContact} slug={slug}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Email" name="email"><input id="email" name="email" type="email" defaultValue={s.contact?.email} className={inputCls} /></Field>
              <Field label="Telepon" name="phone"><input id="phone" name="phone" defaultValue={s.contact?.phone} className={inputCls} /></Field>
              <Field label="WhatsApp" name="whatsapp" hint="Nomor HP, mis. 0812…"><input id="whatsapp" name="whatsapp" inputMode="tel" defaultValue={s.contact?.whatsapp} className={inputCls} /></Field>
            </div>
            <Field label="Alamat" name="address"><textarea id="address" name="address" rows={2} defaultValue={s.contact?.address} className={inputCls} /></Field>
            <Field label="Jam operasional" name="hours"><textarea id="hours" name="hours" rows={2} defaultValue={s.hours} placeholder={'Senin–Jumat 08.00–17.00'} className={inputCls} /></Field>
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-2 text-sm font-medium">Sosial media</legend>
              {SOCIAL.map(([k, l]) => (
                <label key={k} className="text-sm">{l}<input name={k} type="url" defaultValue={s.social?.[k]} placeholder="https://" className={`${inputCls} mt-1`} /></label>
              ))}
            </fieldset>
          </Form>
        </Card>
      )}

      {tab === 'seo' && (
        <Card description="Dipakai di beranda dan halaman tanpa SEO sendiri. Sitemap, canonical, dan data terstruktur dibuat otomatis.">
          <Form action={saveSeo} slug={slug}>
            <Field label="Judul SEO beranda" name="seo_title"><input id="seo_title" name="seo_title" maxLength={120} defaultValue={s.seo?.title} placeholder={row.name} className={inputCls} /></Field>
            <Field label="Deskripsi SEO" name="seo_description"><textarea id="seo_description" name="seo_description" rows={3} maxLength={320} defaultValue={s.seo?.description} className={inputCls} /></Field>
            <div><span className="block text-sm font-medium">Gambar saat dibagikan (Open Graph)</span><div className="mt-1.5"><FilePicker name="seo_image" site={slug} kind="image" defaultFiles={seoImage} label="Pilih gambar" /></div>
              <p className="mt-1.5 text-xs text-muted">Disarankan 1200×630 px. Kosong = logo.</p></div>
            <Field label="robots.txt" name="robots_txt" hint="Kosongkan untuk memakai bawaan. Baris Sitemap ditambahkan otomatis.">
              <textarea id="robots_txt" name="robots_txt" rows={5} defaultValue={s.robots_txt} placeholder={'User-agent: *\nDisallow: /search'} className={`${inputCls} font-mono text-xs`} />
            </Field>
          </Form>
        </Card>
      )}

      {tab === 'bahasa' && (
        <Card description="Bahasa utama tampil di alamat utama; bahasa kedua di /en/… atau /id/…. Teks yang belum diterjemahkan memakai bahasa utama.">
          <Form action={saveLanguages} slug={slug}>
            <Field label="Bahasa utama" name="default_locale">
              <select id="default_locale" name="default_locale" defaultValue={row.default_locale} className={inputCls}>
                <option value="id">Bahasa Indonesia</option><option value="en">English</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="second" defaultChecked={row.locales.length > 1} /> Aktifkan bahasa kedua ({row.default_locale === 'id' ? 'English' : 'Bahasa Indonesia'})</label>
            {row.locales.length > 1 && <p className="text-sm"><Link href={`/s/${slug}/terjemahan`} className="text-accent hover:underline">Kelola terjemahan →</Link></p>}
          </Form>
        </Card>
      )}

      {tab === 'integrasi' && (
        <Card description="Bila salah satu diisi, pengunjung melihat banner persetujuan cookie; script baru dimuat setelah mereka setuju. Analytics bawaan Fauqa One Click tetap berjalan tanpa cookie.">
          <Form action={saveIntegrations} slug={slug}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Google Analytics 4" name="ga4" hint="Measurement ID, mis. G-AB12CD34EF"><input id="ga4" name="ga4" defaultValue={s.integrations?.ga4} placeholder="G-" spellCheck={false} className={`${inputCls} font-mono`} /></Field>
              <Field label="Google Tag Manager" name="gtm" hint="Container ID, mis. GTM-ABC1234"><input id="gtm" name="gtm" defaultValue={s.integrations?.gtm} placeholder="GTM-" spellCheck={false} className={`${inputCls} font-mono`} /></Field>
              <Field label="Meta Pixel" name="pixel" hint="Pixel ID (angka)"><input id="pixel" name="pixel" inputMode="numeric" defaultValue={s.integrations?.pixel} spellCheck={false} className={`${inputCls} font-mono`} /></Field>
              <Field label="Google Search Console" name="gsc" hint="Kode verifikasi, atau tempel seluruh meta tag-nya."><input id="gsc" name="gsc" defaultValue={s.integrations?.gsc} spellCheck={false} className={`${inputCls} font-mono`} /></Field>
            </div>
          </Form>
        </Card>
      )}

      {tab === 'ekspor' && (
        <Card description="Unduh seluruh data situs: konten (JSON), semua theme (.zip), dan daftar file beserta URL-nya. Kiriman form diekspor terpisah dari menu Form masuk.">
          <a href={`/s/${slug}/pengaturan/ekspor`} className={btn.primary}>Unduh ekspor situs (.zip)</a>
        </Card>
      )}

      {tab === 'lanjutan' && (
        <Card>
          <Form action={saveAdvanced} slug={slug}>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Password situs</legend>
              <p className="text-sm text-muted">Situs tetap online tetapi pengunjung harus memasukkan password, cocok untuk soft-launch. {row.password_hash ? <b className="text-ink">Sedang aktif.</b> : 'Sedang tidak aktif.'}</p>
              <input name="password" type="password" autoComplete="new-password" placeholder={row.password_hash ? 'Isi untuk mengganti password' : 'Isi untuk mengaktifkan'} aria-label="Password situs" className={inputCls} />
              {row.password_hash && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="password_off" /> Matikan password situs</label>}
            </fieldset>
            <Field label="Kode tambahan <head>" name="head_code" hint="Mis. verifikasi Google Search Console. Disisipkan apa adanya di setiap halaman; perubahan dicatat di log audit.">
              <textarea id="head_code" name="head_code" rows={5} defaultValue={s.head_code} spellCheck={false} className={`${inputCls} font-mono text-xs`} />
            </Field>
          </Form>
        </Card>
      )}

      {tab === 'hapus' && site.role === 'owner' && (
        <Card title="Hapus situs" description="Situs langsung offline. Selama 30 hari situs bisa dipulihkan dari halaman Buat website; setelah itu semua konten, file, dan theme dihapus permanen.">
          <form action={deleteSite} className="space-y-3">
            <input type="hidden" name="site" value={slug} />
            <label className="block text-sm">Ketik <b>{slug}</b> untuk konfirmasi<input name="confirm" required autoComplete="off" className={`${inputCls} mt-1.5`} /></label>
            <SubmitButton className={btn.danger} pendingText="Menghapus…">Hapus situs</SubmitButton>
          </form>
        </Card>
      )}
    </div>
  );
}

export default function SettingsPage({ params, searchParams }) {
  return <Suspense fallback={<TableSkeleton />}><Settings params={params} searchParams={searchParams} /></Suspense>;
}
