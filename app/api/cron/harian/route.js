// Vercel Cron harian 01.00 WIB (vercel.json): rollup analytics kemarin + retensi 90 hari (PRD §4.9),
// hapus spam form > 30 hari (PRD §4.7), hapus permanen situs yang dihapus > 30 hari beserta file-nya (PRD §4.1).
import { createAdminClient } from '@/lib/supabase/server';
import { storagePaths } from '@/lib/files';
import { addDays, todayIn } from '@/lib/analytics-report';

const ok = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

export async function GET(req) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const db = createAdminClient();
  const month = new Date(Date.now() - 30 * 864e5).toISOString();

  ok(await db.rpc('ensure_analytics_partitions'));
  const rolled = ok(await db.rpc('analytics_rollup', { p_date: addDays(todayIn('Asia/Jakarta'), -1) }));
  const spam = ok(await db.from('form_submissions').delete().eq('status', 'spam').lt('created_at', month).select('id')).length;

  // ponytail: maks. 20 situs per hari; naikkan bila antrean penghapusan menumpuk.
  const sites = ok(await db.from('sites').select('id').lt('deleted_at', month).limit(20));
  for (const { id } of sites) {
    const files = ok(await db.from('files').select('storage_path, variants').eq('site_id', id));
    const themes = ok(await db.from('themes').select('id').eq('site_id', id)).map((t) => t.id);
    const assets = themes.length ? ok(await db.from('theme_files').select('storage_path').in('theme_id', themes).not('storage_path', 'is', null)) : [];
    const sitePaths = files.flatMap(storagePaths).filter(Boolean);
    // Aset theme bawaan (builtin/...) dipakai bersama; hanya aset unggahan theme situs ini yang dihapus.
    const themePaths = assets.map((a) => a.storage_path).filter((p) => themes.some((t) => p.startsWith(`${t}/`)));
    for (let i = 0; i < sitePaths.length; i += 1000) ok(await db.storage.from('site-files').remove(sitePaths.slice(i, i + 1000)));
    for (let i = 0; i < themePaths.length; i += 1000) ok(await db.storage.from('theme-assets').remove(themePaths.slice(i, i + 1000)));
    ok(await db.from('analytics_events').delete().eq('site_id', id));
    ok(await db.from('sites').delete().eq('id', id)); // cascade: konten, theme, domain, anggota, ringkasan analytics
  }
  return Response.json({ rolled, spam, purged: sites.length });
}
