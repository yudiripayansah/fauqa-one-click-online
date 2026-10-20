'use server';

import { contentAction, revalidateSite, cleanHtml, seoFrom, str, go, dbError, HANDLE_RE, parseDate } from '@/lib/content';

export async function savePage(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  const id = str(fd, 'id', 40);
  const row = {
    title: str(fd, 'title', 200), handle: str(fd, 'handle', 80), body: cleanHtml(fd.get('body')),
    template_suffix: str(fd, 'template_suffix', 40) || null, seo: seoFrom(fd),
    status: fd.get('status') === 'published' ? 'published' : 'draft', updated_at: new Date().toISOString(),
  };
  row.published_at = row.status === 'published' ? parseDate(fd.get('published_at'), site.timezone) ?? new Date().toISOString() : parseDate(fd.get('published_at'), site.timezone);
  const back = `/s/${slug}/halaman/${id || 'baru'}`;
  if (!row.title || !HANDLE_RE.test(row.handle)) go(back, 'Isi judul dan URL (huruf kecil, angka, tanda hubung).');
  const { data, error } = id
    ? await supabase.from('pages').update(row).eq('id', id).eq('site_id', site.id).select('id').single()
    : await supabase.from('pages').insert({ ...row, site_id: site.id }).select('id').single();
  if (error) go(back, dbError(error, 'Halaman'));
  revalidateSite(site);
  go(`/s/${slug}/halaman/${data.id}`, 'Halaman disimpan.');
}

export async function deletePage(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  await supabase.from('pages').delete().eq('id', str(fd, 'id', 40)).eq('site_id', site.id);
  revalidateSite(site);
  go(`/s/${slug}/halaman`, 'Halaman dihapus.');
}
