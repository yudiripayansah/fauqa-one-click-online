// Ekspor situs (PRD §8.3, UU PDP): konten JSON + semua theme + daftar file. Owner/admin.
// ponytail: file media tidak dimasukkan ke .zip (bisa sampai 1 GB); files.csv berisi URL publik untuk diunduh.
import { zipSync, strToU8 } from 'fflate';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { fileUrl } from '@/lib/site/data';
import { fileSlug, themeZipEntries } from '@/lib/theme/export';

const TABLES = {
  pages: '*', products: 'id, handle, title, summary, body, media, specs, price_label, tags, downloads, cta, related_ids, template_suffix, seo, status, position, created_at, updated_at',
  collections: '*', blogs: '*', articles: 'id, blog_id, handle, title, excerpt, body, cover, author, tags, seo, status, published_at, created_at, updated_at',
  menus: '*', redirects: '*', translations: 'locale, resource_type, resource_key, field, value', files: 'id, folder, name, storage_path, mime, size, width, height, alt, created_at',
};

export async function GET(_req, { params }) {
  const { site: slug } = await params;
  const { site } = await requireSite(slug, ['owner', 'admin']);
  const supabase = await createClient();
  const [{ data: info }, { data: themes }, ...lists] = await Promise.all([
    supabase.from('sites').select('name, slug, industry, default_locale, locales, settings, live_theme_id, created_at').eq('id', site.id).single(),
    supabase.from('themes').select('id, name').eq('site_id', site.id),
    ...Object.entries(TABLES).map(([t, cols]) => supabase.from(t).select(cols).eq('site_id', site.id).limit(10000).then((r) => r.data ?? [])),
  ]);
  const content = Object.fromEntries(Object.keys(TABLES).map((t, i) => [t, lists[i]]));
  const colIds = content.collections.map((c) => c.id);
  content.collection_products = colIds.length ? (await supabase.from('collection_products').select('collection_id, product_id, position').in('collection_id', colIds)).data : [];

  const entries = { 'content.json': strToU8(JSON.stringify({ exported_at: new Date().toISOString(), site: info, ...content }, null, 2)) };
  entries['files.csv'] = strToU8(['id,folder,name,mime,size,url', ...content.files.map((f) => [f.id, f.folder ?? '', f.name, f.mime, f.size, fileUrl(f.storage_path)].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n'));
  for (const t of themes ?? []) Object.assign(entries, await themeZipEntries(supabase, t.id, `themes/${fileSlug(t.name, 'theme')}-${t.id.slice(0, 8)}${t.id === info.live_theme_id ? '-live' : ''}/`));

  await supabase.rpc('log_audit', { p_site: site.id, p_action: 'site.export' });
  return new Response(zipSync(entries, { level: 6 }), {
    headers: { 'content-type': 'application/zip', 'content-disposition': `attachment; filename="${site.slug}-${new Date().toISOString().slice(0, 10)}.zip"`, 'cache-control': 'no-store' },
  });
}
