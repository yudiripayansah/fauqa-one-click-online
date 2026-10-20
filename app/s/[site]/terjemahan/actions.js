'use server';

// Simpan terjemahan satu item (PRD §4.10). Field yang dikosongkan dihapus → kembali memakai bahasa utama.
import { cleanHtml, contentAction, go, revalidateSite } from '@/lib/content';
import { loadCatalog } from '@/lib/translate';

export async function saveTranslation(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  const r = String(fd.get('r') ?? '');
  const back = `/s/${slug}/terjemahan?r=${encodeURIComponent(r)}`;
  const { data: s } = await supabase.from('sites').select('default_locale, locales').eq('id', site.id).single();
  const locale = s.locales.find((l) => l !== s.default_locale);
  if (!locale) go(`/s/${slug}/pengaturan?tab=bahasa`, 'Aktifkan bahasa kedua dulu.');
  // Field yang boleh disimpan diambil ulang dari katalog, bukan dari form.
  const item = (await loadCatalog(supabase, site.id)).flatMap(([, items]) => items).find((it) => it.id === r);
  if (!item) go(`/s/${slug}/terjemahan`, 'Item tidak ditemukan.');
  const kinds = Object.fromEntries(item.fields.map((f) => [f.field, f.kind]));
  // Body produk/artikel tidak ada di katalog ringan.
  if (['product', 'article'].includes(item.type)) kinds.body = 'richtext';

  const upsert = [];
  const remove = [];
  for (const [field, kind] of Object.entries(kinds)) {
    if (!fd.has(`t:${field}`)) continue;
    const raw = String(fd.get(`t:${field}`)).trim();
    const value = kind === 'richtext' ? cleanHtml(raw) : raw.slice(0, kind === 'text' ? 500 : 5000);
    if (value) upsert.push({ site_id: site.id, locale, resource_type: item.type, resource_key: item.key, field, value, updated_at: new Date().toISOString() });
    else remove.push(field);
  }
  if (upsert.length) {
    const { error } = await supabase.from('translations').upsert(upsert, { onConflict: 'site_id,locale,resource_type,resource_key,field' });
    if (error) go(back, error.message);
  }
  if (remove.length) {
    await supabase.from('translations').delete().eq('site_id', site.id).eq('locale', locale).eq('resource_type', item.type).eq('resource_key', item.key).in('field', remove);
  }
  revalidateSite(site);
  go(back, 'Terjemahan disimpan.');
}
