'use server';

import { contentAction, revalidateSite, str, go, dbError } from '@/lib/content';

// '/lama/', 'https://situs-lama.com/lama?x=1' → '/lama'
const normFrom = (v) => {
  let p = String(v ?? '').trim();
  try { if (/^https?:\/\//.test(p)) p = new URL(p).pathname; } catch {}
  p = p.split(/[?#]/)[0];
  if (!p.startsWith('/')) p = `/${p}`;
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
};
const validTo = (v) => /^(\/[^\s]*|https?:\/\/[^\s]+)$/.test(v);

export async function addRedirect(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  const from_path = normFrom(fd.get('from'));
  const to_url = str(fd, 'to', 500);
  if (from_path === '/' || !validTo(to_url)) go(`/s/${slug}/redirect`, 'URL lama harus diawali / dan URL baru diawali / atau https://.');
  const { error } = await supabase.from('redirects').upsert({ site_id: site.id, from_path, to_url }, { onConflict: 'site_id,from_path' });
  if (error) go(`/s/${slug}/redirect`, dbError(error, 'Redirect'));
  revalidateSite(site);
  go(`/s/${slug}/redirect`, 'Redirect disimpan.');
}

export async function deleteRedirect(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  await supabase.from('redirects').delete().eq('id', str(fd, 'id', 40)).eq('site_id', site.id);
  revalidateSite(site);
  go(`/s/${slug}/redirect`, 'Redirect dihapus.');
}

// CSV/teks: satu baris "url_lama,url_baru" (baris judul & baris tidak valid dilewati).
export async function importRedirects(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  const file = fd.get('file');
  const text = file instanceof File && file.size ? await file.text() : String(fd.get('csv') ?? '');
  const rows = new Map();
  for (const line of text.split(/\r?\n/).slice(0, 2000)) {
    const [a, b] = line.split(/[,;\t]/).map((s) => s?.trim().replace(/^"|"$/g, ''));
    if (!a || !b || !validTo(b)) continue;
    const from_path = normFrom(a);
    if (from_path !== '/') rows.set(from_path, { site_id: site.id, from_path, to_url: b });
  }
  if (!rows.size) go(`/s/${slug}/redirect`, 'Tidak ada baris valid. Format: /url-lama,/url-baru');
  const { error } = await supabase.from('redirects').upsert([...rows.values()], { onConflict: 'site_id,from_path' });
  if (error) go(`/s/${slug}/redirect`, dbError(error, 'Redirect'));
  revalidateSite(site);
  go(`/s/${slug}/redirect`, `${rows.size} redirect diimpor.`);
}
