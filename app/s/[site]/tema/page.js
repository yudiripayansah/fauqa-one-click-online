import { Suspense } from 'react';
import Link from 'next/link';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { Card, PageHeader, TableSkeleton, btn, inlineInputCls } from '@/components/admin/ui';
import { ConfirmButton, SubmitButton } from '@/components/admin/client';
import { addTheme, deleteTheme, publishTheme, renameTheme } from './actions';
import UploadTheme from './UploadTheme';

export const metadata = { title: 'Theme' };

const fmt = (d) => new Intl.DateTimeFormat('id', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(d));
const SOURCE = { builtin: 'Theme bawaan', duplicate: 'Duplikat', upload: 'Upload' };

async function Library({ params }) {
  const { site: slug } = await params;
  const { site } = await requireSite(slug);
  const manage = ['owner', 'admin'].includes(site.role);
  const supabase = await createClient();
  const [{ data: s }, { data: themes }, { data: builtins }] = await Promise.all([
    supabase.from('sites').select('live_theme_id').eq('id', site.id).single(),
    supabase.from('themes').select('id, name, source, builtin_key, updated_at').eq('site_id', site.id).order('updated_at', { ascending: false }),
    supabase.from('themes').select('id, name, builtin_key').is('site_id', null).order('name'),
  ]);
  const live = themes.find((t) => t.id === s.live_theme_id);
  const saved = themes.filter((t) => t.id !== s.live_theme_id);

  const actions = (t, isLive) => (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/editor/${slug}/${t.id}`} className={isLive ? btn.primary : btn.secondary}>Customize</Link>
      <Link href={`/s/${slug}/lihat?theme=${t.id}`} target="_blank" className={btn.ghost}>Preview</Link>
      {manage && <Link href={`/editor/${slug}/${t.id}/kode`} className={btn.ghost}>Edit kode</Link>}
      {manage && <a href={`/editor/${slug}/${t.id}/unduh`} className={btn.ghost}>Download</a>}
      {manage && !isLive && (
        <form action={publishTheme}><input type="hidden" name="site" value={slug} /><input type="hidden" name="id" value={t.id} />
          <SubmitButton className={btn.secondary} pendingText="Memproses…">Publish</SubmitButton></form>
      )}
      {manage && (
        <form action={addTheme}><input type="hidden" name="site" value={slug} /><input type="hidden" name="source" value={t.id} /><input type="hidden" name="name" value={`Salinan ${t.name}`} />
          <SubmitButton className={btn.ghost} pendingText="Menyalin…">Duplikat</SubmitButton></form>
      )}
      {manage && !isLive && (
        <ConfirmButton action={deleteTheme} fields={{ site: slug, id: t.id }} className={btn.ghost} title={`Hapus theme "${t.name}"?`} message="Semua perubahan di theme ini hilang.">Hapus</ConfirmButton>
      )}
    </div>
  );
  const rename = (t) => manage ? (
    <form action={renameTheme} className="flex items-center gap-2">
      <input type="hidden" name="site" value={slug} /><input type="hidden" name="id" value={t.id} />
      <input name="name" defaultValue={t.name} aria-label="Nama theme" className={`${inlineInputCls} font-semibold`} />
      <SubmitButton className={btn.ghost} pendingText="…">Ganti nama</SubmitButton>
    </form>
  ) : <p className="font-semibold">{t.name}</p>;

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Theme" description="Atur tampilan situs. Perubahan pada theme live langsung tayang saat disimpan; untuk perubahan besar, duplikat theme lalu publish setelah selesai." />
      {live && (
        <Card>
          <p className="text-sm text-muted">Theme live</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
            <div>{rename(live)}<p className="mt-1 text-xs text-muted">{SOURCE[live.source]} · diubah {fmt(live.updated_at)}</p></div>
            {actions(live, true)}
          </div>
        </Card>
      )}
      <Card title="Theme tersimpan" description={`${saved.length} dari 10 theme. Theme tersimpan tidak tampil ke pengunjung sampai dipublish.`}>
        {saved.length === 0 ? <p className="text-sm text-muted">Belum ada. Duplikat theme live untuk mencoba perubahan besar dengan aman.</p> : (
          <ul className="divide-y divide-line">
            {saved.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
                <div>{rename(t)}<p className="mt-1 text-xs text-muted">{SOURCE[t.source]} · diubah {fmt(t.updated_at)}</p></div>
                {actions(t, false)}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {manage && (
        <Card title="Upload theme" description="File .zip dengan struktur layout/, templates/, sections/, snippets/, assets/, config/, locales/ (maks. 50 MB, 1.000 file). Theme diperiksa dulu; upload ditolak bila ada error.">
          <UploadTheme site={slug} />
        </Card>
      )}
      {manage && (
        <Card title="Theme bawaan" description="Tambahkan theme bawaan Fauqa One Click ke theme tersimpan.">
          <ul className="flex flex-wrap gap-3">
            {builtins.map((b) => (
              <li key={b.id}>
                <form action={addTheme} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                  <input type="hidden" name="site" value={slug} /><input type="hidden" name="source" value={b.id} /><input type="hidden" name="name" value={b.name} />
                  <span className="font-medium">{b.name}</span>
                  <SubmitButton className={btn.ghost} pendingText="Menambah…">Tambah</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

export default function ThemesPage({ params }) {
  return <Suspense fallback={<TableSkeleton />}><Library params={params} /></Suspense>;
}
