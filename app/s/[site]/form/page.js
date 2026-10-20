import { Suspense } from 'react';
import Link from 'next/link';
import { requireSite, FORM_TYPE } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { Card, PageHeader, TableSkeleton, btn, inputCls, td, th } from '@/components/admin/ui';
import { SubmitButton } from '@/components/admin/client';
import { saveRecipients } from './actions';

export const metadata = { title: 'Form masuk' };

const TABS = [['', 'Kotak masuk'], ['new', 'Baru'], ['done', 'Selesai'], ['spam', 'Spam']];
const fmt = (d) => new Intl.DateTimeFormat('id', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(d));

async function Inbox({ params, searchParams }) {
  const [{ site: slug }, { status = '' }] = await Promise.all([params, searchParams]);
  const { site } = await requireSite(slug);
  const supabase = await createClient();
  let q = supabase.from('form_submissions').select('id, form_type, fields, status, created_at, products (title)').eq('site_id', site.id).order('created_at', { ascending: false }).limit(200);
  q = status ? q.eq('status', status) : q.neq('status', 'spam');
  const [{ data: rows }, { data: s }] = await Promise.all([q, supabase.from('sites').select('settings').eq('id', site.id).single()]);
  const manage = ['owner', 'admin'].includes(site.role);
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Form masuk" description="Kiriman form kontak, permintaan penawaran, dan newsletter dari situs."
        action={<a href={`/s/${slug}/form/ekspor?status=${status}`} className={btn.secondary}>Ekspor CSV</a>} />
      <nav aria-label="Filter status" className="flex flex-wrap gap-1">
        {TABS.map(([v, l]) => (
          <Link key={v} href={`/s/${slug}/form${v ? `?status=${v}` : ''}`} aria-current={status === v ? 'page' : undefined}
            className="rounded-full border border-line px-3 py-1 text-sm text-muted aria-[current=page]:border-accent aria-[current=page]:bg-accent-tint aria-[current=page]:text-accent">{l}</Link>
        ))}
      </nav>
      {rows.length === 0 ? <p className="rounded-card border border-dashed border-line px-6 py-12 text-center text-sm text-muted">Belum ada kiriman di sini.</p> : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line"><tr><th className={th}>Pengirim</th><th className={th}>Jenis</th><th className={th}>Waktu</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-b border-line last:border-0 hover:bg-line/30 ${r.status === 'new' ? 'font-semibold' : ''}`}>
                  <td className={td}>
                    <Link href={`/s/${slug}/form/${r.id}`} className="hover:text-accent">{r.fields.name || r.fields.email || '(tanpa nama)'}</Link>
                    <span className="block truncate text-xs font-normal text-muted">{(r.fields.body ?? r.fields.email ?? '').slice(0, 90)}</span>
                  </td>
                  <td className={`${td} font-normal text-muted`}>{FORM_TYPE[r.form_type]}{r.products?.title && ` · ${r.products.title}`}</td>
                  <td className={`${td} whitespace-nowrap font-normal text-muted`}>{fmt(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {manage && (
        <Card title="Notifikasi email" description="Setiap kiriman baru dikirim ke email ini. Kosongkan untuk memakai email owner. Balas email notifikasi untuk menjawab pengirim.">
          <form action={saveRecipients} className="flex flex-wrap gap-2">
            <input type="hidden" name="site" value={slug} />
            <input name="recipients" defaultValue={(s.settings?.form_recipients ?? []).join(', ')} placeholder="sales@perusahaan.com, cs@perusahaan.com" aria-label="Email penerima" className={`${inputCls} max-w-lg flex-1`} />
            <SubmitButton>Simpan</SubmitButton>
          </form>
        </Card>
      )}
    </div>
  );
}

export default function FormsPage({ params, searchParams }) {
  return <Suspense fallback={<TableSkeleton />}><Inbox params={params} searchParams={searchParams} /></Suspense>;
}
