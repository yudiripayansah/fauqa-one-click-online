import { Suspense } from 'react';
import Link from 'next/link';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, EmptyState, TableSkeleton, btn, td, th } from '@/components/admin/ui';
import { StatusBadge } from '@/components/admin/content';

export const metadata = { title: 'Halaman' };

async function List({ params }) {
  const { site: slug } = await params;
  const { site } = await requireSite(slug);
  const supabase = await createClient();
  const { data: pages } = await supabase.from('pages').select('id, title, handle, status, published_at, updated_at').eq('site_id', site.id).order('title');
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Halaman" description="Halaman statis seperti Tentang Kami, Kontak, dan Kebijakan Privasi."
        action={<Link href={`/s/${slug}/halaman/baru`} className={btn.primary}>Tambah halaman</Link>} />
      {pages.length === 0 ? <EmptyState title="Belum ada halaman" actionHref={`/s/${slug}/halaman/baru`} actionLabel="Tambah halaman" /> : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line"><tr><th className={th}>Judul</th><th className={th}>URL</th><th className={th}>Status</th></tr></thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-line/30">
                  <td className={td}><Link href={`/s/${slug}/halaman/${p.id}`} className="font-medium hover:text-accent">{p.title}</Link></td>
                  <td className={`${td} text-muted`}>/pages/{p.handle}</td>
                  <td className={td}>
                    <StatusBadge status={p.status} />
                    {p.status === 'published' && new Date(p.published_at) > new Date() && <span className="ml-2 text-xs text-muted">Terjadwal</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function PagesPage({ params }) {
  return <Suspense fallback={<TableSkeleton />}><List params={params} /></Suspense>;
}
