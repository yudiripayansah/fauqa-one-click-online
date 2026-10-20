// Unduh theme bawaan sebagai .zip (bahan versi baru).
import { zipSync } from 'fflate';
import { requirePlatformAdmin } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { themeZipEntries } from '@/lib/theme/export';

export async function GET(_req, { params }) {
  await requirePlatformAdmin();
  const { key } = await params;
  const supabase = await createClient();
  const { data: theme } = await supabase.from('themes').select('id, builtin_version').is('site_id', null).eq('builtin_key', key).maybeSingle();
  if (!theme) return new Response('Not found', { status: 404 });
  return new Response(zipSync(await themeZipEntries(supabase, theme.id), { level: 6 }), {
    headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${key}-v${theme.builtin_version}.zip"`, 'cache-control': 'no-store' },
  });
}
