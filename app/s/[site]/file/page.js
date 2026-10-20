import { Suspense } from 'react';
import Link from 'next/link';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { ACCEPT, fileUsage, formatSize, kindOf } from '@/lib/files';
import { fileUrl } from '@/lib/site/data';
import { Card, Field, PageHeader, TableSkeleton, btn, inputCls, inlineInputCls, td, th } from '@/components/admin/ui';
import { CopyButton, SubmitButton } from '@/components/admin/client';
import { deleteFile, updateFile } from './actions';
import Uploader from './Uploader';

export const metadata = { title: 'File' };

const TYPES = [['', 'Semua'], ['image', 'Gambar'], ['video', 'Video'], ['document', 'Dokumen'], ['font', 'Font']];

async function Manager({ params, searchParams }) {
  const [{ site: slug }, sp] = await Promise.all([params, searchParams]);
  const { folder = '', q = '', type = '', view = 'grid', file: selectedId } = sp;
  const { site } = await requireSite(slug);
  const supabase = await createClient();
  const [{ data: all }, { data: plan }] = await Promise.all([
    supabase.from('files').select('id, name, folder, storage_path, mime, size, width, height, variants, alt, created_at, site_id').eq('site_id', site.id).order('created_at', { ascending: false }),
    supabase.from('sites').select('plans (limits)').eq('id', site.id).single(),
  ]);
  const used = all.reduce((n, f) => n + Number(f.size), 0);
  const quota = (plan?.plans?.limits?.storage_mb ?? 1024) * 1024 * 1024;
  const folders = [...new Set(all.flatMap((f) => f.folder.split('/').map((_, i, a) => a.slice(0, i + 1).join('/'))).filter(Boolean))].sort();
  if (folder && !folders.includes(folder)) folders.push(folder);
  const files = all.filter((f) => (q ? f.name.toLowerCase().includes(q.toLowerCase()) : f.folder === folder) && (!type || kindOf(f.mime) === type));
  const selected = all.find((f) => f.id === selectedId);
  const usage = selected ? await fileUsage(supabase, selected) : [];
  const link = (extra) => `/s/${slug}/file?${new URLSearchParams(Object.entries({ folder, q, type, view, ...extra }).filter(([, v]) => v))}`;
  const thumb = (f) => fileUrl(f.variants?.[400] ?? f.storage_path);

  return (
    <div className="space-y-6">
      <PageHeader title="File" description="Pustaka gambar, video, dan dokumen situs. Dipakai di konten dan theme."
        action={<p className="text-sm text-muted">{formatSize(used)} dari {formatSize(quota)} terpakai
          <span className="mt-1 block h-1.5 w-48 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round((used / quota) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Pemakaian storage">
            <span className="block h-full bg-accent" style={{ width: `${Math.min(100, (used / quota) * 100)}%` }} /></span></p>} />
      <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
        <aside className="space-y-3">
          <nav aria-label="Folder" className="space-y-0.5 text-sm">
            {['', ...folders].map((f) => (
              <Link key={f || 'root'} href={`/s/${slug}/file?${new URLSearchParams(f ? { folder: f } : {})}`} aria-current={!q && f === folder ? 'page' : undefined}
                style={{ paddingLeft: `${0.75 + (f ? f.split('/').length : 0) * 0.75}rem` }}
                className="block truncate rounded-lg py-1.5 pr-3 text-muted hover:bg-line/40 hover:text-ink aria-[current=page]:bg-accent-tint aria-[current=page]:font-semibold aria-[current=page]:text-accent">
                {f ? f.split('/').at(-1) : 'Semua file (akar)'}
              </Link>
            ))}
          </nav>
          <form className="flex gap-1">
            <input name="folder" required placeholder={folder ? `${folder}/folder-baru` : 'folder-baru'} aria-label="Folder baru" pattern="[a-z0-9][a-z0-9 _\-/]*" className={inputCls} />
            <button className={btn.secondary} title="Buka folder baru, lalu unggah file ke sana">+</button>
          </form>
        </aside>
        <div className="min-w-0 space-y-4">
          <Uploader site={slug} folder={folder} accept={ACCEPT} />
          <form className="flex flex-wrap items-center gap-2" role="search">
            <input type="hidden" name="folder" value={folder} />
            <input type="search" name="q" defaultValue={q} placeholder="Cari di semua folder" aria-label="Cari file" className={`${inputCls} max-w-xs`} />
            <select name="type" defaultValue={type} aria-label="Tipe file" className={`${inlineInputCls} w-auto`}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <input type="hidden" name="view" value={view} />
            <button className={btn.secondary}>Terapkan</button>
            <span className="ml-auto flex gap-1">
              <Link href={link({ view: 'grid' })} aria-current={view === 'grid' ? 'true' : undefined} className={`${btn.ghost} aria-[current]:text-accent`}>Grid</Link>
              <Link href={link({ view: 'list' })} aria-current={view === 'list' ? 'true' : undefined} className={`${btn.ghost} aria-[current]:text-accent`}>List</Link>
            </span>
          </form>
          <div className={selected ? 'grid gap-4 xl:grid-cols-[1fr_22rem]' : ''}>
            {files.length === 0 ? <p className="rounded-card border border-dashed border-line px-6 py-12 text-center text-sm text-muted">{q ? 'Tidak ada file yang cocok.' : 'Folder ini masih kosong.'}</p>
              : view === 'list' ? (
                <div className="overflow-x-auto rounded-card border border-line bg-surface">
                  <table className="w-full text-sm">
                    <thead className="border-b border-line"><tr><th className={th}>Nama</th><th className={th}>Ukuran</th><th className={th}>Dimensi</th></tr></thead>
                    <tbody>{files.map((f) => (
                      <tr key={f.id} className="border-b border-line last:border-0 hover:bg-line/30">
                        <td className={td}><Link href={link({ file: f.id })} className="font-medium hover:text-accent">{f.name}</Link>{q && <span className="block text-xs text-muted">/{f.folder}</span>}</td>
                        <td className={`${td} text-muted`}>{formatSize(f.size)}</td>
                        <td className={`${td} text-muted`}>{f.width ? `${f.width}×${f.height}` : '—'}</td>
                      </tr>))}</tbody>
                  </table>
                </div>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 2xl:grid-cols-6">
                  {files.map((f) => (
                    <li key={f.id}>
                      <Link href={link({ file: f.id })} aria-current={f.id === selectedId ? 'true' : undefined}
                        className="block rounded-lg border border-line bg-surface p-1.5 hover:border-accent aria-[current]:border-accent aria-[current]:ring-2 aria-[current]:ring-accent/30">
                        {f.mime.startsWith('image/')
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={thumb(f)} alt={f.alt} loading="lazy" className="aspect-square w-full rounded-md bg-line/40 object-cover" />
                          : <span className="flex aspect-square w-full items-center justify-center rounded-md bg-line/40 text-sm font-semibold uppercase text-muted">{f.name.split('.').pop()}</span>}
                        <span className="mt-1 block truncate px-0.5 text-xs">{f.name}</span>
                        {!f.alt && f.mime.startsWith('image/') && <span className="block px-0.5 text-[11px] text-danger">Tanpa alt text</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            {selected && (
              <Card className="self-start">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="break-all font-semibold">{selected.name}</h2>
                  <Link href={link({ file: '' })} className={btn.ghost} aria-label="Tutup detail">✕</Link>
                </div>
                {selected.mime.startsWith('image/')
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={fileUrl(selected.variants?.[800] ?? selected.storage_path)} alt={selected.alt} className="mt-3 w-full rounded-lg bg-line/40" />
                  : selected.mime.startsWith('video/') ? <video src={fileUrl(selected.storage_path)} controls className="mt-3 w-full rounded-lg" /> : null}
                <dl className="mt-3 grid grid-cols-2 gap-1 text-sm">
                  <dt className="text-muted">Ukuran</dt><dd>{formatSize(selected.size)}</dd>
                  {selected.width && <><dt className="text-muted">Dimensi</dt><dd>{selected.width}×{selected.height}</dd></>}
                  <dt className="text-muted">Tipe</dt><dd className="truncate">{selected.mime}</dd>
                </dl>
                <div className="mt-3 flex gap-2"><CopyButton text={fileUrl(selected.storage_path)}>Salin URL</CopyButton>
                  <a href={fileUrl(selected.storage_path)} target="_blank" rel="noopener" className={btn.ghost}>Buka</a></div>
                <form action={updateFile} className="mt-4 space-y-3">
                  <input type="hidden" name="site" value={slug} /><input type="hidden" name="id" value={selected.id} />
                  {selected.mime.startsWith('image/') && (
                    <Field label="Alt text" name="alt" hint="Deskripsi gambar untuk pembaca layar & SEO.">
                      <textarea id="alt" name="alt" rows={2} defaultValue={selected.alt} className={inputCls} />
                    </Field>
                  )}
                  <Field label="Nama" name="name"><input id="name" name="name" defaultValue={selected.name} className={inputCls} /></Field>
                  <Field label="Folder" name="folder" hint="Kosongkan untuk akar.">
                    <input id="folder" name="folder" list="folders" defaultValue={selected.folder} className={inputCls} />
                    <datalist id="folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
                  </Field>
                  <SubmitButton>Simpan</SubmitButton>
                </form>
                <div className="mt-5 border-t border-line pt-4">
                  <h3 className="text-sm font-semibold">Dipakai di</h3>
                  {usage.length === 0 ? <p className="mt-1 text-sm text-muted">Tidak dipakai konten mana pun.</p> : (
                    <ul className="mt-1 space-y-1 text-sm">{usage.map((u) => <li key={u.type + u.id}><span className="text-muted">{u.type}:</span> <Link href={`/s/${slug}/${u.href}`} className="text-accent hover:underline">{u.title}</Link></li>)}</ul>
                  )}
                  <form action={deleteFile} className="mt-4 space-y-2">
                    <input type="hidden" name="site" value={slug} /><input type="hidden" name="id" value={selected.id} />
                    {usage.length > 0 && <label className="flex items-center gap-2 text-sm text-danger"><input type="checkbox" name="force" /> Tetap hapus walau masih dipakai</label>}
                    <SubmitButton className={btn.danger} pendingText="Menghapus…">Hapus file</SubmitButton>
                  </form>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FilesPage({ params, searchParams }) {
  return <Suspense fallback={<TableSkeleton />}><Manager params={params} searchParams={searchParams} /></Suspense>;
}
