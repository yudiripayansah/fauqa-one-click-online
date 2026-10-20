'use server';

import { contentAction, revalidateSite, cleanHtml, seoFrom, str, ids, go, dbError, HANDLE_RE, toHandle, parseDate } from '@/lib/content';

export async function saveBlog(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  const id = str(fd, 'id', 40);
  const title = str(fd, 'title', 100);
  const handle = str(fd, 'handle', 80) || toHandle(title);
  if (!title || !HANDLE_RE.test(handle)) go(`/s/${slug}/blog`, 'Isi nama blog.');
  const { error } = id
    ? await supabase.from('blogs').update({ title, handle }).eq('id', id).eq('site_id', site.id)
    : await supabase.from('blogs').insert({ site_id: site.id, title, handle });
  if (error) go(`/s/${slug}/blog`, dbError(error, 'Blog'));
  revalidateSite(site);
  go(`/s/${slug}/blog`, 'Blog disimpan.');
}

export async function deleteBlog(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  await supabase.from('blogs').delete().eq('id', str(fd, 'id', 40)).eq('site_id', site.id);
  revalidateSite(site);
  go(`/s/${slug}/blog`, 'Blog dan artikelnya dihapus.');
}

export async function saveArticle(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  const id = str(fd, 'id', 40);
  const row = {
    title: str(fd, 'title', 200), handle: str(fd, 'handle', 80), blog_id: str(fd, 'blog_id', 40),
    excerpt: str(fd, 'excerpt', 500), body: cleanHtml(fd.get('body')), cover: ids(fd, 'cover')[0] ?? null,
    author: str(fd, 'author', 100), tags: [...new Set(str(fd, 'tags').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20),
    seo: seoFrom(fd), status: fd.get('status') === 'published' ? 'published' : 'draft', updated_at: new Date().toISOString(),
  };
  row.published_at = parseDate(fd.get('published_at'), site.timezone) ?? (row.status === 'published' ? new Date().toISOString() : null);
  const back = `/s/${slug}/blog/artikel/${id || 'baru'}`;
  if (!row.title || !HANDLE_RE.test(row.handle)) go(back, 'Isi judul dan URL (huruf kecil, angka, tanda hubung).');
  const { data: blog } = await supabase.from('blogs').select('id').eq('id', row.blog_id).eq('site_id', site.id).maybeSingle();
  if (!blog) go(back, 'Pilih blog.');
  const { data, error } = id
    ? await supabase.from('articles').update(row).eq('id', id).eq('site_id', site.id).select('id').single()
    : await supabase.from('articles').insert({ ...row, site_id: site.id }).select('id').single();
  if (error) go(back, dbError(error, 'Artikel'));
  revalidateSite(site);
  go(`/s/${slug}/blog/artikel/${data.id}`, 'Artikel disimpan.');
}

export async function deleteArticle(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  await supabase.from('articles').delete().eq('id', str(fd, 'id', 40)).eq('site_id', site.id);
  revalidateSite(site);
  go(`/s/${slug}/blog`, 'Artikel dihapus.');
}
