'use server';

import { contentAction, revalidateSite, str, go, dbError, HANDLE_RE, toHandle } from '@/lib/content';

// Pohon item: [{ title, url, items: [...] }], maks. 3 level & 100 item.
function cleanItems(items, depth = 1, count = { n: 0 }) {
  if (!Array.isArray(items) || depth > 3) return [];
  return items.flatMap((it) => {
    const title = String(it?.title ?? '').trim().slice(0, 80);
    const url = String(it?.url ?? '').trim().slice(0, 500);
    if (!title || !/^(\/|https?:\/\/|mailto:|tel:|#)/.test(url) || ++count.n > 100) return [];
    return [{ title, url, items: cleanItems(it.items, depth + 1, count) }];
  });
}

export async function saveMenu(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  const id = str(fd, 'id', 40);
  const title = str(fd, 'title', 80);
  let items = [];
  try { items = cleanItems(JSON.parse(String(fd.get('items') || '[]'))); } catch {}
  const back = `/s/${slug}/menu${id ? `?menu=${id}` : ''}`;
  if (!title) go(back, 'Isi nama menu.');
  if (id) {
    const { error } = await supabase.from('menus').update({ title, items, updated_at: new Date().toISOString() }).eq('id', id).eq('site_id', site.id);
    if (error) go(back, dbError(error, 'Menu'));
    revalidateSite(site);
    go(back, 'Menu disimpan.');
  }
  const handle = toHandle(str(fd, 'handle', 60) || title);
  if (!HANDLE_RE.test(handle)) go(back, 'Nama menu tidak valid.');
  const { data, error } = await supabase.from('menus').insert({ site_id: site.id, title, handle, items }).select('id').single();
  if (error) go(back, dbError(error, 'Menu'));
  go(`/s/${slug}/menu?menu=${data.id}`, 'Menu dibuat.');
}

export async function deleteMenu(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  await supabase.from('menus').delete().eq('id', str(fd, 'id', 40)).eq('site_id', site.id);
  revalidateSite(site);
  go(`/s/${slug}/menu`, 'Menu dihapus.');
}
