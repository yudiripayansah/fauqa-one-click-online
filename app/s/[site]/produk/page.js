import { Suspense } from 'react';
import Link from 'next/link';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { fileRefs } from '@/lib/files';
import { PageHeader, EmptyState, TableSkeleton, btn, inputCls, td, th } from '@/components/admin/ui';
import { StatusBadge } from '@/components/admin/content';

export const metadata = { title: 'Produk' };

async function List({ params, searchParams }) {
  const [{ site: slug }, { q = '' }] = await Promise.all([params, searchParams]);
  const { site } = await requireSite(slug);
  const supabase = await createClient();
  let query = supabase.from('products').select('id, title, handle, status, price_label, media', { count: 'exact' }).eq('site_id', site.id).order('position').order('created_at', { ascending: false });
  if (q) query = query.ilike('title', `%${q.replace(/[%_]/g, '')}%`);
  const { data: products, count } = await query;
  const thumbs = Object.fromEntries((await fileRefs(supabase, site.id, products.map((p) => p.media[0]).filter(Boolean))).map((f) => [f.id, f]));
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Produk & layanan" description={`Showcase produk dengan tombol tanya/hubungi. ${count ?? 0} dari 500 produk.`}
        action={<Link href={`/s/${slug}/produk/baru`} className={btn.primary}>Tambah produk</Link>} />
      <form className="flex gap-2" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Cari nama produk" aria-label="Cari produk" className={`${inputCls} max-w-xs`} />
        <button className={btn.secondary}>Cari</button>
      </form>
      {products.length === 0 ? <EmptyState title={q ? 'Tidak ada produk yang cocok' : 'Belum ada produk'} actionHref={`/s/${slug}/produk/baru`} actionLabel="Tambah produk" /> : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line"><tr><th className={th}><span className="sr-only">Gambar</span></th><th className={th}>Nama</th><th className={th}>Harga tampil</th><th className={th}>Status</th></tr></thead>
            <tbody>
              {products.map((p) => {
                const t = thumbs[p.media[0]];
                return (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-line/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <td className={`${td} w-16`}>{t ? <img src={t.thumb} alt="" className="size-12 rounded-md object-cover" /> : <span className="block size-12 rounded-md bg-line/60" />}</td>
                    <td className={td}><Link href={`/s/${slug}/produk/${p.id}`} className="font-medium hover:text-accent">{p.title}</Link><span className="block text-xs text-muted">/products/{p.handle}</span></td>
                    <td className={`${td} text-muted`}>{p.price_label || '—'}</td>
                    <td className={td}><StatusBadge status={p.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ProductsPage({ params, searchParams }) {
  return <Suspense fallback={<TableSkeleton />}><List params={params} searchParams={searchParams} /></Suspense>;
}
