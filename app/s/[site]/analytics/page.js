import { Suspense } from 'react';
import Link from 'next/link';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { addDays, loadReport, todayIn } from '@/lib/analytics-report';
import { Card, PageHeader, TableSkeleton, btn, inlineInputCls } from '@/components/admin/ui';
import Realtime from './Realtime';

export const metadata = { title: 'Analytics' };

const RANGES = [['today', 'Hari ini', 1], ['7', '7 hari', 7], ['30', '30 hari', 30], ['90', '90 hari', 90]];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const fmt = (n) => Math.round(n).toLocaleString('id-ID');
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
const dur = (s) => (s >= 60 ? `${Math.floor(s / 60)} mnt ${Math.round(s % 60)} dtk` : `${Math.round(s)} dtk`);
const EVENT_LABEL = { whatsapp: 'Klik WhatsApp', phone: 'Klik telepon', email: 'Klik email', download: 'Unduh file', outbound: 'Link keluar', form_submit: 'Kirim form' };

// Rentang dari query: r = today | 7 | 30 | 90 | custom (from, to).
function range(sp, tz) {
  const today = todayIn(tz);
  if (sp.r === 'custom' && DATE.test(sp.from ?? '') && DATE.test(sp.to ?? '') && sp.from <= sp.to && sp.to <= today && sp.from >= addDays(today, -730)) {
    return { key: 'custom', from: sp.from, to: sp.to };
  }
  const [key, , days] = RANGES.find(([k]) => k === sp.r) ?? RANGES[1];
  return { key, from: addDays(today, 1 - days), to: today };
}

function Change({ now, before, invert = false }) {
  if (!before) return null;
  const d = Math.round(((now - before) / before) * 100);
  if (!d) return <span className="text-xs text-muted">sama</span>;
  const good = invert ? d < 0 : d > 0;
  return <span className={`text-xs ${good ? 'text-success' : 'text-danger'}`}>{d > 0 ? '+' : ''}{d}%<span className="sr-only"> dibanding periode sebelumnya</span></span>;
}

function Chart({ daily }) {
  const max = Math.max(1, ...daily.map((d) => d.pageviews));
  const w = 100 / daily.length;
  return (
    <figure>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-48 w-full" aria-hidden="true">
        {daily.map((d, i) => (
          <g key={d.date}>
            <rect x={i * w + w * 0.15} width={w * 0.7} y={40 - (d.pageviews / max) * 38} height={(d.pageviews / max) * 38} className="fill-accent-tint" />
            <rect x={i * w + w * 0.15} width={w * 0.7} y={40 - (d.visitors / max) * 38} height={(d.visitors / max) * 38} className="fill-accent" />
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-muted">
        <span>{daily[0].date}</span>
        <span className="flex gap-4"><span><span className="mr-1 inline-block size-2 rounded-sm bg-accent" />Pengunjung</span><span><span className="mr-1 inline-block size-2 rounded-sm bg-accent-tint" />Pageview</span></span>
        <span>{daily.at(-1).date}</span>
      </figcaption>
      <table className="sr-only">
        <caption>Pengunjung dan pageview per hari</caption>
        <thead><tr><th>Tanggal</th><th>Pengunjung</th><th>Pageview</th></tr></thead>
        <tbody>{daily.map((d) => <tr key={d.date}><td>{d.date}</td><td>{d.visitors}</td><td>{d.pageviews}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

function Top({ title, rows = [], metric = 'visitors', label = (v) => v, unit = 'pengunjung' }) {
  const list = rows.filter((r) => r.value).slice(0, 8);
  const max = Math.max(1, ...list.map((r) => r[metric]));
  return (
    <Card title={title}>
      {list.length === 0 ? <p className="text-sm text-muted">Belum ada data.</p> : (
        <ol className="space-y-1.5 text-sm">
          {list.map((r) => (
            <li key={r.value} className="relative flex justify-between gap-3 overflow-hidden rounded px-2 py-1">
              <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-accent-tint" style={{ width: `${(r[metric] / max) * 100}%` }} />
              <span className="relative truncate">{label(r.value)}</span>
              <span className="relative tabular-nums text-muted">{fmt(r[metric])}<span className="sr-only"> {unit}</span></span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

async function Analytics({ params, searchParams }) {
  const [{ site: slug }, sp] = await Promise.all([params, searchParams]);
  const { site } = await requireSite(slug);
  const supabase = await createClient();
  const r = range(sp, site.timezone);
  const [report, { data: live }] = await Promise.all([
    loadReport(supabase, site.id, r.from, r.to),
    supabase.rpc('analytics_realtime', { p_site: site.id }),
  ]);
  const { totals: t, previous: p, daily, dims } = report;
  const kpis = [
    ['Pengunjung', fmt(t.visitors), t.visitors, p.visitors],
    ['Pageview', fmt(t.pageviews), t.pageviews, p.pageviews],
    ['Durasi rata-rata', dur(t.sessions ? t.duration / t.sessions : 0), t.sessions ? t.duration / t.sessions : 0, p.sessions ? p.duration / p.sessions : 0],
    ['Bounce rate', pct(t.bounces, t.sessions), t.sessions ? t.bounces / t.sessions : 0, p.sessions ? p.bounces / p.sessions : 0, true],
  ];
  const conversions = (dims.event ?? []).filter((e) => ['form_submit', 'whatsapp'].includes(e.value)).reduce((n, e) => n + e.events, 0);

  return (
    <div className="max-w-6xl space-y-6">
      <PageHeader title="Analytics" description="Tanpa cookie; IP pengunjung tidak disimpan. Kunjungan anggota situs tidak dihitung."
        action={<a href={`/s/${slug}/analytics/ekspor?from=${r.from}&to=${r.to}`} className={btn.secondary}>Ekspor CSV</a>} />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Rentang waktu" className="flex flex-wrap items-center gap-1">
          {RANGES.map(([k, l]) => (
            <Link key={k} href={`/s/${slug}/analytics?r=${k}`} aria-current={r.key === k ? 'page' : undefined}
              className="rounded-full border border-line px-3 py-1 text-sm text-muted aria-[current=page]:border-accent aria-[current=page]:bg-accent-tint aria-[current=page]:text-accent">{l}</Link>
          ))}
          <form className="ml-1 flex flex-wrap items-center gap-1 text-sm">
            <input type="hidden" name="r" value="custom" />
            <input type="date" name="from" defaultValue={r.from} aria-label="Dari tanggal" className={`${inlineInputCls} py-1`} />
            <span aria-hidden="true">–</span>
            <input type="date" name="to" defaultValue={r.to} aria-label="Sampai tanggal" className={`${inlineInputCls} py-1`} />
            <button className={`${btn.secondary} py-1`}>Terapkan</button>
          </form>
        </nav>
        <Realtime site={slug} initial={live ?? 0} />
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map(([label, shown, now, before, invert]) => (
          <div key={label} className="rounded-card border border-line bg-surface p-4">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="mt-1 flex items-baseline gap-2"><span className="text-2xl font-semibold tabular-nums">{shown}</span><Change now={now} before={before} invert={invert} /></dd>
          </div>
        ))}
        <div className="rounded-card border border-line bg-surface p-4">
          <dt className="text-sm text-muted">Konversi</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{fmt(conversions)}</dd>
          <dd className="text-xs text-muted">Kirim form + klik WhatsApp</dd>
        </div>
      </dl>

      <Card><Chart daily={daily} /></Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Top title="Halaman teratas" rows={dims.page} metric="pageviews" unit="pageview" />
        <Top title="Sumber" rows={dims.source} />
        <Top title="Konversi per sumber" rows={dims.conversion} metric="events" unit="konversi" />
        <Top title="Produk paling dilihat" rows={dims.product} metric="pageviews" unit="pageview" />
        <Top title="Event" rows={dims.event} metric="events" unit="kali" label={(v) => EVENT_LABEL[v] ?? v} />
        <Top title="Kampanye (UTM)" rows={dims.campaign} />
        <Top title="Negara" rows={dims.country} />
        <Top title="Kota" rows={dims.city} />
        <Top title="Perangkat" rows={dims.device} label={(v) => ({ mobile: 'Ponsel', desktop: 'Desktop', tablet: 'Tablet' })[v] ?? v} />
        <Top title="Browser" rows={dims.browser} />
        <Top title="Sistem operasi" rows={dims.os} />
      </div>
    </div>
  );
}

export default function AnalyticsPage({ params, searchParams }) {
  return <Suspense fallback={<TableSkeleton />}><Analytics params={params} searchParams={searchParams} /></Suspense>;
}
