// Ekspor analytics ke CSV (PRD §4.9): satu baris per tanggal × dimensi × nilai.
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { csvResponse } from '@/lib/csv';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req, { params }) {
  const { site: slug } = await params;
  const { site } = await requireSite(slug);
  const sp = req.nextUrl.searchParams;
  const from = sp.get('from');
  const to = sp.get('to');
  if (!DATE.test(from ?? '') || !DATE.test(to ?? '') || from > to) return new Response('Rentang tanggal tidak valid', { status: 400 });
  const { data, error } = await (await createClient()).rpc('analytics_report', { p_site: site.id, p_from: from, p_to: to });
  if (error) return new Response(error.message, { status: 400 });
  data.sort((a, b) => a.date.localeCompare(b.date) || a.dimension.localeCompare(b.dimension) || b.visitors - a.visitors);
  return csvResponse(`analytics-${site.slug}-${from}-${to}.csv`,
    ['tanggal', 'dimensi', 'nilai', 'pengunjung', 'pageview', 'event', 'kunjungan', 'bounce', 'durasi_detik'],
    data.map((r) => [r.date, r.dimension, r.value, r.visitors, r.pageviews, r.events, r.sessions, r.bounces, r.duration_s]));
}
