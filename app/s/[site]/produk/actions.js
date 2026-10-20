'use server';

import { contentAction, revalidateSite, cleanHtml, seoFrom, str, ids, go, dbError, HANDLE_RE } from '@/lib/content';

const CTA = ['inquiry', 'whatsapp', 'link'];

export async function saveProduct(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  const id = str(fd, 'id', 40);
  let specs = [];
  try { specs = JSON.parse(String(fd.get('specs') || '[]')).slice(0, 50).map((s) => ({ label: String(s.label).slice(0, 100), value: String(s.value).slice(0, 300) })); } catch {}
  const ctaType = CTA.includes(fd.get('cta_type')) ? fd.get('cta_type') : 'inquiry';
  const ctaUrl = str(fd, 'cta_url', 500);
  const row = {
    title: str(fd, 'title', 200), handle: str(fd, 'handle', 80), summary: str(fd, 'summary', 500), body: cleanHtml(fd.get('body')),
    media: ids(fd, 'media'), downloads: ids(fd, 'downloads'), related_ids: ids(fd, 'related').filter((r) => r !== id).slice(0, 8),
    specs, price_label: str(fd, 'price_label', 80),
    tags: [...new Set(str(fd, 'tags').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20),
    cta: { type: ctaType, label: str(fd, 'cta_label', 60), ...(ctaType === 'link' && /^(https?:\/\/|\/)/.test(ctaUrl) ? { url: ctaUrl } : {}) },
    template_suffix: str(fd, 'template_suffix', 40) || null, seo: seoFrom(fd), position: Number(fd.get('position')) || 0,
    status: fd.get('status') === 'published' ? 'published' : 'draft', updated_at: new Date().toISOString(),
  };
  const back = `/s/${slug}/produk/${id || 'baru'}`;
  if (!row.title || !HANDLE_RE.test(row.handle)) go(back, 'Isi nama produk dan URL (huruf kecil, angka, tanda hubung).');
  if (ctaType === 'link' && !row.cta.url) go(back, 'Isi link tombol (diawali https:// atau /).');
  const { data, error } = id
    ? await supabase.from('products').update(row).eq('id', id).eq('site_id', site.id).select('id').single()
    : await supabase.from('products').insert({ ...row, site_id: site.id }).select('id').single();
  if (error) go(back, dbError(error, 'Produk'));

  // Keanggotaan koleksi manual.
  const { data: manual } = await supabase.from('collections').select('id').eq('site_id', site.id).eq('rule', 'manual');
  const chosen = new Set(ids(fd, 'collections'));
  await supabase.from('collection_products').delete().eq('product_id', data.id).in('collection_id', manual.map((c) => c.id));
  const add = manual.filter((c) => chosen.has(c.id)).map((c) => ({ collection_id: c.id, product_id: data.id, position: 999 }));
  if (add.length) await supabase.from('collection_products').insert(add);

  revalidateSite(site);
  go(`/s/${slug}/produk/${data.id}`, 'Produk disimpan.');
}

export async function deleteProduct(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  await supabase.from('products').delete().eq('id', str(fd, 'id', 40)).eq('site_id', site.id);
  revalidateSite(site);
  go(`/s/${slug}/produk`, 'Produk dihapus.');
}
