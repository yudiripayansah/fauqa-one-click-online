// Laporan analytics (PRD §4.9) dari RPC analytics_report: total, seri harian, dan daftar teratas per dimensi.
import { hoursOf } from '@/lib/tz';

const DAY = 864e5;
export const isoDate = (d) => d.toISOString().slice(0, 10);
/** Tanggal hari ini di zona waktu situs (YYYY-MM-DD). */
export const todayIn = (tz) => isoDate(new Date(Date.now() + hoursOf(tz) * 36e5));
export const addDays = (iso, n) => isoDate(new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY));
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY) + 1;

const sum = (rows) => rows.reduce((t, r) => ({
  visitors: t.visitors + r.visitors, pageviews: t.pageviews + r.pageviews, events: t.events + r.events,
  sessions: t.sessions + r.sessions, bounces: t.bounces + r.bounces, duration: t.duration + Number(r.duration_s),
}), { visitors: 0, pageviews: 0, events: 0, sessions: 0, bounces: 0, duration: 0 });

/** { totals, previous, daily: [{ date, visitors, pageviews }], dims: { page: [{ value, visitors, pageviews, events }], ... } } */
export async function loadReport(supabase, siteId, from, to) {
  const len = daysBetween(from, to);
  const [{ data, error }, { data: prev }] = await Promise.all([
    supabase.rpc('analytics_report', { p_site: siteId, p_from: from, p_to: to }),
    supabase.rpc('analytics_report', { p_site: siteId, p_from: addDays(from, -len), p_to: addDays(from, -1) }).eq('dimension', 'total'),
  ]);
  if (error) throw error;
  const totalRows = data.filter((r) => r.dimension === 'total');
  const byDate = Object.fromEntries(totalRows.map((r) => [r.date, r]));
  const daily = Array.from({ length: len }, (_, i) => {
    const date = addDays(from, i);
    return { date, visitors: byDate[date]?.visitors ?? 0, pageviews: byDate[date]?.pageviews ?? 0 };
  });
  const dims = {};
  for (const r of data) {
    if (r.dimension === 'total') continue;
    const list = (dims[r.dimension] ??= new Map());
    const cur = list.get(r.value) ?? { value: r.value, visitors: 0, pageviews: 0, events: 0 };
    cur.visitors += r.visitors; cur.pageviews += r.pageviews; cur.events += r.events;
    list.set(r.value, cur);
  }
  for (const k of Object.keys(dims)) dims[k] = [...dims[k].values()].sort((a, b) => b.visitors - a.visitors || b.pageviews - a.pageviews || b.events - a.events);
  return { totals: sum(totalRows), previous: sum(prev ?? []), daily, dims };
}
