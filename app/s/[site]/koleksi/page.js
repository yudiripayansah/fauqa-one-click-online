import { Suspense } from 'react';
import Link from 'next/link';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, EmptyState, TableSkeleton, btn, td, th } from '@/components/admin/ui';

export const metadata = { title: 'Koleksi' };

async function List({ params }) {
  const { site: slug } = await params;
  const { site } = await requireSite(slug);
  const supabase = await createClient();
  const { data: cols } = await supabase.from('collections').select('id, title, handle, rule, rule_tag, collection_products (count)').eq('site_id', site.id).order('position').order('title');
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Koleksi" description="Kelompok produk, dipilih manual atau otomatis berdasarkan tag."
        action={<Link href={`/s/${slug}/koleksi/baru`} className={btn.primary}>Tambah koleksi</Link>} />
      {cols.length === 0 ? <EmptyState title="Belum ada koleksi" description="Semua produk tetap tampil di /collections/all." actionHref={`/s/${slug}/koleksi/baru`} actionLabel="Tambah koleksi" /> : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line"><tr><th className={th}>Judul</th><th className={th}>Isi</th></tr></thead>
            <tbody>
              {cols.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0 hover:bg-line/30">
                  <td className={td}><Link href={`/s/${slug}/koleksi/${c.id}`} className="font-medium hover:text-accent">{c.title}</Link><span className="block text-xs text-muted">/collections/{c.handle}</span></td>
                  <td className={`${td} text-muted`}>{c.rule === 'tag' ? `Otomatis: tag "${c.rule_tag}"` : `${c.collection_products[0]?.count ?? 0} produk`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function CollectionsPage({ params }) {
  return <Suspense fallback={<TableSkeleton />}><List params={params} /></Suspense>;
}
