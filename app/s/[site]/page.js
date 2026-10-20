import { Suspense } from 'react';
import Link from 'next/link';
import { FORM_TYPE, requireSite, STATUS_LABEL } from '@/lib/dal';
import { addDays, loadReport, todayIn } from '@/lib/analytics-report';
import { Card, PageHeader, btn } from '@/components/admin/ui';
import { SubmitButton } from '@/components/admin/client';
import { siteUrl } from '@/lib/hosts';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { setStatus } from '../actions';

const STATUS_TONE = {
  published: 'bg-success/15 text-success', draft: 'bg-line text-muted', unpublished: 'bg-line text-muted', suspended: 'bg-danger/15 text-danger',
};

// Alasan suspend dari platform admin (PRD §4.1).
async function SuspendReason({ id }) {
  const { data } = await (await createClient()).from('sites').select('suspended_reason').eq('id', id).single();
  return <>Alasan: {data?.suspended_reason || 'pelanggaran ketentuan'}. Hubungi tim Fauqa One Click bila ini keliru.</>;
}

// Checklist "Siap publish" (PRD §5): hal yang sebaiknya beres sebelum situs dibuka ke publik.
async function Checklist({ site }) {
  const supabase = await createClient();
  const sample = (t) => supabase.from(t).select('id', { count: 'exact', head: true }).eq('site_id', site.id).not('sample', 'is', null);
  const [{ data: row }, { data: owner }, ...counts] = await Promise.all([
    supabase.from('sites').select('settings').eq('id', site.id).single(),
    supabase.from('site_members').select('user_id').eq('site_id', site.id).eq('role', 'owner').single(),
    sample('pages'), sample('products'), sample('articles'),
  ]);
  const { data: u } = await createAdminClient().auth.admin.getUserById(owner.user_id);
  const s = row.settings ?? {};
  const [pages, products, articles] = counts.map((c) => c.count ?? 0);
  const base = `/s/${site.slug}`;
  const items = [
    [!!u?.user?.email_confirmed_at, 'Verifikasi email owner', 'Wajib sebelum publish. Cek kotak masuk email owner.', null],
    [!!s.logo_file, 'Unggah logo', 'Tampil di header dan saat situs dibagikan.', `${base}/pengaturan`],
    [!!(s.contact?.email || s.contact?.whatsapp || s.contact?.phone), 'Lengkapi kontak', 'Email, telepon, atau WhatsApp untuk pengunjung.', `${base}/pengaturan?tab=kontak`],
    [!pages, 'Ganti teks halaman contoh', `${pages} halaman masih berisi teks contoh.`, `${base}/halaman`],
    [!products, 'Ganti produk/layanan contoh', `${products} produk masih contoh. Ganti atau hapus, lalu tambahkan foto.`, `${base}/produk`],
    [!articles, 'Ganti artikel contoh', `${articles} artikel masih contoh.`, `${base}/blog`],
  ];
  const done = items.filter(([ok]) => ok).length;
  if (done === items.length) return null;
  return (
    <Card title="Siap publish" description={`${done} dari ${items.length} beres. Gambar di beranda juga masih gambar contoh; ganti lewat Theme → Customize.`}>
      <ul className="divide-y divide-line">
        {items.map(([ok, title, hint, href]) => (
          <li key={title} className="flex items-start gap-3 py-3">
            <span aria-hidden="true" className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs ${ok ? 'bg-success text-white' : 'border border-line'}`}>{ok ? '✓' : ''}</span>
            <div className="min-w-0 flex-1">
              <p className={ok ? 'text-muted line-through' : 'font-medium'}>{title}<span className="sr-only">{ok ? ' (selesai)' : ' (belum)'}</span></p>
              {!ok && <p className="text-sm text-muted">{hint}</p>}
            </div>
            {!ok && href && <a href={href} className={btn.ghost}>Buka</a>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Ringkasan 7 hari + form masuk terbaru (PRD §5).
async function Overview({ site }) {
  const supabase = await createClient();
  const to = todayIn(site.timezone);
  const [report, { data: forms }] = await Promise.all([
    loadReport(supabase, site.id, addDays(to, -6), to).catch(() => null),
    supabase.from('form_submissions').select('id, form_type, fields, status, created_at').eq('site_id', site.id).neq('status', 'spam').order('created_at', { ascending: false }).limit(5),
  ]);
  const t = report?.totals;
  const conv = (report?.dims.event ?? []).filter((e) => ['form_submit', 'whatsapp'].includes(e.value)).reduce((n, e) => n + e.events, 0);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="7 hari terakhir">
        {t ? (
          <dl className="grid grid-cols-3 gap-4">
            {[['Pengunjung', t.visitors], ['Pageview', t.pageviews], ['Konversi', conv]].map(([l, v]) => (
              <div key={l}><dt className="text-sm text-muted">{l}</dt><dd className="text-2xl font-semibold tabular-nums">{v.toLocaleString('id-ID')}</dd></div>
            ))}
          </dl>
        ) : <p className="text-sm text-muted">Analytics belum tersedia.</p>}
        <Link href={`/s/${site.slug}/analytics`} className={`${btn.ghost} mt-3 -ml-2`}>Buka analytics</Link>
      </Card>
      <Card title="Form masuk terbaru">
        {forms?.length ? (
          <ul className="divide-y divide-line text-sm">
            {forms.map((f) => (
              <li key={f.id}>
                <Link href={`/s/${site.slug}/form/${f.id}`} className="flex justify-between gap-3 py-2 hover:text-accent">
                  <span className={`truncate ${f.status === 'new' ? 'font-semibold' : ''}`}>{f.fields.name || f.fields.email || 'Tanpa nama'}<span className="font-normal text-muted"> · {FORM_TYPE[f.form_type]}</span></span>
                  <time dateTime={f.created_at} className="shrink-0 text-muted">{new Date(f.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</time>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Belum ada kiriman form.</p>}
      </Card>
    </div>
  );
}

// Pemakaian kuota plan (PRD §5). Batas yang sama dicek di database saat menambah data.
async function Quota({ site }) {
  const supabase = await createClient();
  const count = (t, extra = (q) => q) => extra(supabase.from(t).select('id', { count: 'exact', head: true }).eq('site_id', site.id)).then((r) => r.count ?? 0);
  const [{ data: row }, pages, products, articles, themes, domains, { data: files }] = await Promise.all([
    supabase.from('sites').select('plans (name, limits)').eq('id', site.id).single(),
    count('pages'), count('products'), count('articles'), count('themes'), count('domains', (q) => q.eq('type', 'custom')),
    supabase.from('files').select('size').eq('site_id', site.id),
  ]);
  const l = row.plans?.limits ?? {};
  const mb = (files ?? []).reduce((n, f) => n + (f.size ?? 0), 0) / 1048576;
  const rows = [
    ['Halaman', pages, l.pages], ['Produk', products, l.products], ['Artikel', articles, l.articles],
    ['Storage', mb, l.storage_mb, (v) => `${v < 10 ? v.toFixed(1) : Math.round(v)} MB`], ['Theme tersimpan', themes, l.themes], ['Custom domain', domains, l.custom_domains],
  ];
  return (
    <Card title="Kuota" description={`Plan ${row.plans?.name ?? 'Free'}.`}>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {rows.map(([label, used, max, fmt = (v) => v]) => {
          const pct = max ? Math.min(100, (used / max) * 100) : 0;
          return (
            <div key={label}>
              <div className="flex justify-between text-sm"><dt>{label}</dt><dd className="tabular-nums text-muted">{fmt(used)} / {max ? fmt(max) : '∞'}</dd></div>
              <div aria-hidden="true" className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
                <div className={`h-full rounded-full ${pct >= 90 ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}

async function Dashboard({ params }) {
  const { site: slug } = await params;
  const { site } = await requireSite(slug);
  const url = siteUrl(site.slug);
  const canPublish = ['owner', 'admin'].includes(site.role) && site.status !== 'suspended';
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title={site.name} description={<a href={url} target="_blank" rel="noopener" className="hover:text-ink">{url.replace(/^https?:\/\//, '')}</a>}
        action={
          <a href={`/s/${site.slug}/lihat`} target="_blank" rel="noopener" className={btn.secondary}>Lihat situs</a>
        } />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Status situs</p>
            <p className="mt-1 flex items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ${STATUS_TONE[site.status]}`}>{STATUS_LABEL[site.status]}</span>
              <span className="text-sm text-muted">
                {site.status === 'published' ? 'Pengunjung bisa membuka situs Anda.' : site.status === 'suspended' ? <SuspendReason id={site.id} /> : 'Hanya anggota situs yang bisa melihatnya.'}
              </span>
            </p>
          </div>
          {canPublish && (
            <form action={setStatus}>
              <input type="hidden" name="site" value={site.slug} />
              <input type="hidden" name="status" value={site.status === 'published' ? 'unpublished' : 'published'} />
              <SubmitButton className={site.status === 'published' ? btn.secondary : btn.primary} pendingText="Memproses…">
                {site.status === 'published' ? 'Jadikan offline' : 'Publish'}
              </SubmitButton>
            </form>
          )}
        </div>
      </Card>
      {site.status !== 'suspended' && <Checklist site={site} />}
      <Overview site={site} />
      {['owner', 'admin'].includes(site.role) && <Quota site={site} />}
    </div>
  );
}

export default function SitePage({ params }) {
  return <Suspense fallback={<div className="h-40" aria-busy="true" />}><Dashboard params={params} /></Suspense>;
}
