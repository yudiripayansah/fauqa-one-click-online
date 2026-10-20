// Download theme sebagai .zip (PRD §4.4) — struktur folder sama dengan yang bisa di-upload kembali.
import { zipSync } from 'fflate';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { fileSlug, themeZipEntries } from '@/lib/theme/export';

export async function GET(_req, { params }) {
  const { site: slug, theme: themeId } = await params;
  const { site } = await requireSite(slug, ['owner', 'admin']);
  const supabase = await createClient();
  const { data: theme } = await supabase.from('themes').select('name').eq('id', themeId).eq('site_id', site.id).maybeSingle();
  if (!theme) return new Response('Not found', { status: 404 });
  const zip = zipSync(await themeZipEntries(supabase, themeId), { level: 6 });
  return new Response(zip, { headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${fileSlug(theme.name, 'theme')}.zip"`, 'cache-control': 'no-store' } });
}
