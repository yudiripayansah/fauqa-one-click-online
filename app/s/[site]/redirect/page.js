import { Suspense } from 'react';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { Card, PageHeader, Pager, TableSkeleton, btn, inputCls, likeTerm, pageOf, pageRange, td, th } from '@/components/admin/ui';
import { SubmitButton } from '@/components/admin/client';
import { addRedirect, deleteRedirect, importRedirects } from './actions';

export const metadata = { title: 'Redirect' };

async function Redirects({ params, searchParams }) {
  const [{ site: slug }, { q = '', page }] = await Promise.all([params, searchParams]);
  const n = pageOf(page);
  const { site } = await requireSite(slug);
  const supabase = await createClient();
  let query = supabase.from('redirects').select('id, from_path, to_url, hits', { count: 'exact' }).eq('site_id', site.id).order('from_path');
  if (q) query = query.or(`from_path.ilike.${likeTerm(q)},to_url.ilike.${likeTerm(q)}`);
  const { data, count } = await query.range(...pageRange(n));
  const rows = data ?? []; // null bila halaman melewati jumlah data (416)
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Redirect" description="Arahkan URL lama ke halaman baru (301), berguna saat pindah dari website lama. Hanya berlaku bila URL lama tidak ditemukan." />
      <Card title="Tambah redirect">
        <form action={addRedirect} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="site" value={slug} />
          <label className="flex-1 text-sm font-medium">URL lama<input name="from" required placeholder="/produk.php?id=12 atau /about-us" className={`${inputCls} mt-1.5`} /></label>
          <label className="flex-1 text-sm font-medium">Arahkan ke<input name="to" required placeholder="/pages/tentang-kami" className={`${inputCls} mt-1.5`} /></label>
          <SubmitButton>Tambah</SubmitButton>
        </form>
      </Card>
      {(count > 0 || q) && (
        <form className="flex gap-2" role="search">
          <input type="search" name="q" defaultValue={q} placeholder="Cari URL lama atau tujuan" aria-label="Cari redirect" className={`${inputCls} max-w-xs`} />
          <button className={btn.secondary}>Cari</button>
        </form>
      )}
      {q && rows.length === 0 && <p className="text-sm text-muted">Tidak ada redirect yang cocok.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line"><tr><th className={th}>URL lama</th><th className={th}>Arahkan ke</th><th className={th}>Kunjungan</th><th className={th}><span className="sr-only">Aksi</span></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className={`${td} break-all`}>{r.from_path}</td>
                  <td className={`${td} break-all text-muted`}>{r.to_url}</td>
                  <td className={`${td} text-muted`}>{r.hits}</td>
                  <td className={`${td} text-right`}>
                    <form action={deleteRedirect}><input type="hidden" name="site" value={slug} /><input type="hidden" name="id" value={r.id} />
                      <SubmitButton className={btn.ghost} pendingText="…" aria-label={`Hapus redirect ${r.from_path}`}>Hapus</SubmitButton></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={n} count={count} href={(p) => `/s/${slug}/redirect?${new URLSearchParams({ ...(q && { q }), page: String(p) })}`} />
      <Card title="Impor CSV" description="Satu baris per redirect: url_lama,url_baru. Redirect yang sudah ada ditimpa.">
        <form action={importRedirects} className="space-y-3">
          <input type="hidden" name="site" value={slug} />
          <textarea name="csv" rows={4} placeholder={'/about-us,/pages/tentang-kami\n/produk.php,/collections/all'} aria-label="Isi CSV" className={`${inputCls} font-mono`} />
          <div className="flex flex-wrap items-center gap-3">
            <input type="file" name="file" accept=".csv,.txt,text/csv" aria-label="File CSV" className="text-sm" />
            <SubmitButton className={btn.secondary}>Impor</SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function RedirectsPage({ params, searchParams }) {
  return <Suspense fallback={<TableSkeleton />}><Redirects params={params} searchParams={searchParams} /></Suspense>;
}
