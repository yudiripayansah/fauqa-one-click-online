'use server';

import { contentAction, revalidateSite, cleanHtml, seoFrom, str, ids, go, dbError, HANDLE_RE } from '@/lib/content';

export async function saveCollection(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  const id = str(fd, 'id', 40);
  const rule = fd.get('rule') === 'tag' ? 'tag' : 'manual';
  const row = {
    title: str(fd, 'title', 200), handle: str(fd, 'handle', 80), body: cleanHtml(fd.get('body')),
    image: ids(fd, 'image')[0] ?? null, rule, rule_tag: rule === 'tag' ? str(fd, 'rule_tag', 60).toLowerCase() || null : null,
    sort: ['title', 'newest'].includes(fd.get('sort')) ? fd.get('sort') : 'manual', seo: seoFrom(fd), position: Number(fd.get('position')) || 0,
  };
  const back = `/s/${slug}/koleksi/${id || 'baru'}`;
  if (!row.title || !HANDLE_RE.test(row.handle) || row.handle === 'all') go(back, 'Isi judul dan URL (bukan "all").');
  if (rule === 'tag' && !row.rule_tag) go(back, 'Isi tag untuk koleksi otomatis.');
  const { data, error } = id
    ? await supabase.from('collections').update(row).eq('id', id).eq('site_id', site.id).select('id').single()
    : await supabase.from('collections').insert({ ...row, site_id: site.id }).select('id').single();
  if (error) go(back, dbError(error, 'Koleksi'));

  if (rule === 'manual') {
    const chosen = ids(fd, 'products');
    await supabase.from('collection_products').delete().eq('collection_id', data.id);
    if (chosen.length) {
      const rows = chosen.map((pid) => ({ collection_id: data.id, product_id: pid, position: Number(fd.get(`pos_${pid}`)) || 0 }));
      const { error: e } = await supabase.from('collection_products').insert(rows);
      if (e) go(back, e.message);
    }
  }
  revalidateSite(site);
  go(`/s/${slug}/koleksi/${data.id}`, 'Koleksi disimpan.');
}

export async function deleteCollection(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  await supabase.from('collections').delete().eq('id', str(fd, 'id', 40)).eq('site_id', site.id);
  revalidateSite(site);
  go(`/s/${slug}/koleksi`, 'Koleksi dihapus.');
}
