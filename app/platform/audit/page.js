import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, TableSkeleton } from '@/components/admin/ui';

export const metadata = { title: 'Log audit' };

async function Audit() {
  const supabase = await createClient();
  const { data } = await supabase.from('audit_logs').select('id, action, detail, created_at, user_id, sites (name, slug)').order('created_at', { ascending: false }).limit(300);
  const ids = [...new Set(data.map((r) => r.user_id).filter(Boolean))];
  const { data: people } = ids.length ? await supabase.from('profiles').select('user_id, name').in('user_id', ids) : { data: [] };
  const name = Object.fromEntries((people ?? []).map((p) => [p.user_id, p.name]));
  return (
    <div className="space-y-6">
      <PageHeader title="Log audit" description="300 aktivitas terakhir di semua situs: publish, theme & kode, domain, anggota, pengaturan, tindakan platform." />
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs text-muted"><tr><th className="px-4 py-3 font-medium">Waktu</th><th className="px-4 py-3 font-medium">Situs</th><th className="px-4 py-3 font-medium">Oleh</th><th className="px-4 py-3 font-medium">Aksi</th><th className="px-4 py-3 font-medium">Detail</th></tr></thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 align-top">
                <td className="px-4 py-2 whitespace-nowrap text-muted">{new Date(r.created_at).toLocaleString('id-ID')}</td>
                <td className="px-4 py-2">{r.sites?.name ?? '–'}</td>
                <td className="px-4 py-2">{name[r.user_id] ?? (r.user_id ? '?' : 'Sistem')}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.action}</td>
                <td className="max-w-80 truncate px-4 py-2 font-mono text-xs text-muted" title={JSON.stringify(r.detail)}>{Object.keys(r.detail ?? {}).length ? JSON.stringify(r.detail) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AuditPage() {
  return <Suspense fallback={<TableSkeleton />}><Audit /></Suspense>;
}
