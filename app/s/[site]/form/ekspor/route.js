// Ekspor kiriman form ke CSV (PRD §4.7).
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { csvResponse } from '@/lib/csv';

export async function GET(req, { params }) {
  const { site: slug } = await params;
  const { site } = await requireSite(slug);
  const status = req.nextUrl.searchParams.get('status');
  const supabase = await createClient();
  let q = supabase.from('form_submissions').select('created_at, form_type, status, fields, page_path, note, products (title)').eq('site_id', site.id).order('created_at', { ascending: false }).limit(10000);
  q = status ? q.eq('status', status) : q.neq('status', 'spam');
  const { data } = await q;
  const keys = [...new Set(data.flatMap((r) => Object.keys(r.fields)))];
  const head = ['waktu', 'jenis', 'status', 'produk', 'halaman', ...keys, 'catatan'];
  return csvResponse(`form-${site.slug}-${new Date().toISOString().slice(0, 10)}.csv`, head,
    data.map((r) => [r.created_at, r.form_type, r.status, r.products?.title, r.page_path, ...keys.map((k) => r.fields[k]), r.note]));
}
