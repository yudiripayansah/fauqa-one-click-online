import { Suspense } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { STATUS_LABEL } from '@/lib/dal';
import { siteUrl, PROTOCOL } from '@/lib/hosts';
import { PageHeader, TableSkeleton, btn, inlineInputCls } from '@/components/admin/ui';
import SuspendForm from './SuspendForm';

export const metadata = { title: { absolute: 'Situs · Platform · Fauqa One Click' } };
const PER = 50;

async function Sites({ searchParams }) {
  const { q = '', status = '', page = '1' } = await searchParams;
  const n = Math.max(1, Number.parseInt(page, 10) || 1);
  const supabase = await createClient();
  let query = supabase.from('sites').select('id, name, slug, status, suspended_reason, created_at, deleted_at, pages (count), products (count), domains!domains_site_id_fkey (hostname, status, type)', { count: 'exact' })
    .order('created_at', { ascending: false }).range((n - 1) * PER, n * PER - 1);
  const term = q.trim().replace(/[%,()]/g, '');
  if (term) query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%`);
  if (status === 'deleted') query = query.not('deleted_at', 'is', null);
  else if (status) query = query.eq('status', status).is('deleted_at', null);
  const { data: sites, count, error } = await query;
  if (error) throw error;
  const back = `/platform?${new URLSearchParams({ q, status, page: String(n) })}`;
  return (
    <div className="space-y-6">
      <PageHeader title="Situs" description={`${count ?? 0} situs`} />
      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Cari nama atau slug" aria-label="Cari situs" className={inlineInputCls} />
        <select name="status" defaultValue={status} aria-label="Status" className={inlineInputCls}>
          <option value="">Semua status</option>
          {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          <option value="deleted">Dihapus</option>
        </select>
        <button className={btn.secondary}>Terapkan</button>
      </form>
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-muted"><tr>
            <th className="px-4 py-3 font-medium">Situs</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Domain</th>
            <th className="px-4 py-3 font-medium">Pemakaian</th><th className="px-4 py-3 font-medium">Dibuat</th><th className="px-4 py-3" />
          </tr></thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0 align-top">
                <td className="px-4 py-3"><a href={siteUrl(s.slug)} target="_blank" rel="noopener" className="font-medium hover:text-accent">{s.name}</a><span className="block text-xs text-muted">{s.slug}</span></td>
                <td className="px-4 py-3">{s.deleted_at ? 'Dihapus' : STATUS_LABEL[s.status]}{s.suspended_reason && <span className="block max-w-56 text-xs text-muted">{s.suspended_reason}</span>}</td>
                <td className="px-4 py-3 text-xs">{s.domains.filter((d) => d.type === 'custom').map((d) => <a key={d.hostname} href={`${PROTOCOL}://${d.hostname}`} target="_blank" rel="noopener" className="block hover:text-accent">{d.hostname} <span className="text-muted">({d.status})</span></a>)}</td>
                <td className="px-4 py-3 text-xs text-muted">{s.pages[0]?.count ?? 0} halaman · {s.products[0]?.count ?? 0} produk</td>
                <td className="px-4 py-3 text-xs text-muted">{new Date(s.created_at).toLocaleDateString('id-ID')}</td>
                <td className="px-4 py-3 text-right">{!s.deleted_at && <SuspendForm site={s} back={back} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <nav aria-label="Halaman" className="flex gap-2">
        {n > 1 && <Link href={`/platform?${new URLSearchParams({ q, status, page: String(n - 1) })}`} className={btn.secondary}>Sebelumnya</Link>}
        {count > n * PER && <Link href={`/platform?${new URLSearchParams({ q, status, page: String(n + 1) })}`} className={btn.secondary}>Berikutnya</Link>}
      </nav>
    </div>
  );
}

export default function PlatformSites({ searchParams }) {
  return <Suspense fallback={<TableSkeleton />}><Sites searchParams={searchParams} /></Suspense>;
}
