import { Suspense } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { siteUrl } from '@/lib/hosts';
import { EmptyState, PageHeader, TableSkeleton, btn } from '@/components/admin/ui';
import { SubmitButton } from '@/components/admin/client';
import { dismissReport } from '../actions';
import SuspendForm from '../SuspendForm';

export const metadata = { title: 'Laporan' };
const REASON = { phishing: 'Phishing', scam: 'Penipuan', spam: 'Spam', lainnya: 'Lainnya' };

async function Reports({ searchParams }) {
  const { status = 'new' } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from('abuse_reports').select('id, reason, detail, reporter_email, status, created_at, sites (id, name, slug, status)')
    .eq('status', ['new', 'dismissed', 'actioned'].includes(status) ? status : 'new').order('created_at', { ascending: false }).limit(200);
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Laporan penyalahgunaan" description="Dari tombol &ldquo;Laporkan situs&rdquo; di badge setiap situs." />
      <nav aria-label="Status laporan" className="flex gap-1">
        {[['new', 'Baru'], ['actioned', 'Ditindak'], ['dismissed', 'Diabaikan']].map(([k, l]) => (
          <Link key={k} href={`/platform/laporan?status=${k}`} aria-current={status === k ? 'page' : undefined}
            className="rounded-full border border-line px-3 py-1 text-sm text-muted aria-[current=page]:border-accent aria-[current=page]:bg-accent-tint aria-[current=page]:text-accent">{l}</Link>
        ))}
      </nav>
      {!data?.length ? <EmptyState title="Tidak ada laporan" /> : (
        <ul className="space-y-3">
          {data.map((r) => (
            <li key={r.id} className="rounded-card border border-line bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p><span className="rounded-full bg-danger/15 px-2 py-0.5 text-xs font-semibold text-danger">{REASON[r.reason]}</span>{' '}
                    <a href={siteUrl(r.sites.slug)} target="_blank" rel="noopener" className="font-medium hover:text-accent">{r.sites.name}</a>
                    <span className="text-sm text-muted"> · {new Date(r.created_at).toLocaleString('id-ID')}</span></p>
                  {r.detail && <p className="mt-2 text-sm whitespace-pre-line">{r.detail}</p>}
                  {r.reporter_email && <p className="mt-1 text-xs text-muted">Pelapor: {r.reporter_email}</p>}
                </div>
                {r.status === 'new' && (
                  <div className="flex gap-2">
                    <form action={dismissReport}><input type="hidden" name="id" value={r.id} /><SubmitButton className={btn.ghost} pendingText="…">Abaikan</SubmitButton></form>
                    <SuspendForm site={r.sites} back="/platform/laporan" report />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ReportsPage({ searchParams }) {
  return <Suspense fallback={<TableSkeleton />}><Reports searchParams={searchParams} /></Suspense>;
}
