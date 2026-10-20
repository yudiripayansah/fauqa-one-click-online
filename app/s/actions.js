'use server';

import { redirect } from 'next/navigation';
import { updateTag } from 'next/cache';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { requireSession, requireSite } from '@/lib/dal';
import { siteTag } from '@/lib/site/data';
import { processUpload } from '@/lib/files';
import { applyContent } from '@/lib/preset';
import { generateSite } from '@/lib/ai';

const HEX = /^#[0-9a-f]{6}$/i;

// Wizard buat situs (PRD §4.2): situs + theme pilihan, lalu konten dari AI (bila ada deskripsi) atau preset industri.
export async function createSite(_prev, formData) {
  const session = await requireSession();
  const v = Object.fromEntries(['name', 'slug', 'industry', 'locale', 'theme', 'style', 'accent', 'description', 'email', 'phone', 'whatsapp', 'address']
    .map((k) => [k, String(formData.get(k) ?? '').trim()]));
  v.slug = v.slug.toLowerCase();
  v.locale = v.locale === 'en' ? 'en' : 'id';
  v.second = formData.get('second') === 'on';
  v.ownColor = formData.get('own_color') === 'on';
  const fail = (error) => ({ error, values: v });
  if (!v.name) return fail({ name: 'Isi nama company.' });
  if (!/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/.test(v.slug)) return fail({ slug: 'Pakai huruf kecil, angka, dan tanda hubung (maks. 40 karakter).' });
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) return fail({ email: 'Email tidak valid.' });
  const logo = formData.get('logo');

  const supabase = await createClient();
  const { data: siteId, error } = await supabase.rpc('create_site', { p_name: v.name.slice(0, 120), p_slug: v.slug, p_industry: v.industry || 'umum', p_locale: v.locale, p_theme: v.theme || 'lumen' });
  if (error) return fail(error.code === '23505' ? { slug: 'Alamat ini sudah dipakai situs lain.' } : /Theme/.test(error.message) ? { theme: error.message } : { slug: error.message });

  let msg = 'Website dibuat. Cek checklist di bawah sebelum publish.';
  try {
    const { data: site } = await supabase.from('sites').select('live_theme_id').eq('id', siteId).single();
    const settings = {
      contact: { email: v.email.toLowerCase(), phone: v.phone.slice(0, 40), whatsapp: v.whatsapp.replace(/[^\d]/g, '').replace(/^0/, '62').slice(0, 20), address: v.address.slice(0, 500) },
    };
    if (logo instanceof File && logo.size) {
      const up = await processUpload(supabase, siteId, logo, { folder: 'Brand', takenNames: [] });
      if (up.row) {
        await supabase.from('files').insert({ ...up.row, created_by: session.userId });
        settings.logo_file = up.row.id;
      } else msg += ` Logo tidak diunggah: ${up.error}`;
    }
    const { data: rows } = await supabase.from('industry_presets').select('key, data').in('key', [v.industry, 'umum']);
    const preset = rows.find((r) => r.key === v.industry) ?? rows[0];
    const ai = v.description ? await generateSite({ supabase, siteId, userId: session.userId, input: v, preset: preset.data }) : null;
    const c = ai?.content?.[v.locale] ?? preset.data[v.locale];
    await applyContent(supabase, {
      siteId, themeId: site.live_theme_id, locale: v.locale, name: v.name, c, sample: ai?.content ? 'ai' : 'preset',
      c2: v.second ? ai?.content?.[v.locale === 'id' ? 'en' : 'id'] ?? preset.data[v.locale === 'id' ? 'en' : 'id'] : null,
      style: v.style, accent: v.ownColor && HEX.test(v.accent) ? v.accent : null, settings,
    });
    if (v.second) await supabase.from('sites').update({ locales: [v.locale, v.locale === 'id' ? 'en' : 'id'] }).eq('id', siteId);
    if (v.description && !ai?.content) msg = 'Website dibuat dari contoh industri (AI sedang tidak tersedia). Ganti teks contoh sebelum publish.';
  } catch (e) {
    console.error('wizard', e);
    msg = 'Website dibuat, tetapi sebagian konten contoh gagal diisi. Lengkapi lewat menu Konten.';
  }
  redirect(`/s/${v.slug}?msg=${encodeURIComponent(msg)}`);
}

export async function setStatus(formData) {
  const slug = String(formData.get('site'));
  const status = formData.get('status') === 'published' ? 'published' : 'unpublished';
  const { site } = await requireSite(slug, ['owner', 'admin']);
  const supabase = await createClient();
  // Cegah situs phishing (PRD §8.2): email owner wajib terverifikasi sebelum publish.
  if (status === 'published') {
    const { data: owner } = await supabase.from('site_members').select('user_id').eq('site_id', site.id).eq('role', 'owner').single();
    const { data: u } = await createAdminClient().auth.admin.getUserById(owner.user_id);
    if (!u?.user?.email_confirmed_at) redirect(`/s/${slug}?msg=${encodeURIComponent('Owner harus memverifikasi email dulu sebelum situs bisa dipublish. Cek kotak masuk email owner.')}`);
  }
  const { error } = await supabase.from('sites').update({ status }).eq('id', site.id);
  if (error) redirect(`/s/${slug}?msg=${encodeURIComponent(error.message)}`);
  await supabase.rpc('log_audit', { p_site: site.id, p_action: `site.${status === 'published' ? 'publish' : 'unpublish'}` });
  updateTag(siteTag(site.id));
  redirect(`/s/${slug}?msg=${encodeURIComponent(status === 'published' ? 'Situs online.' : 'Situs offline.')}`);
}

// Pulihkan situs yang dihapus < 30 hari (owner).
export async function restoreSite(formData) {
  const session = await requireSession();
  const id = String(formData.get('id'));
  const supabase = await createClient();
  const { data: m } = await supabase.from('site_members').select('role').eq('site_id', id).eq('user_id', session.userId).maybeSingle();
  if (m?.role !== 'owner') redirect('/s/baru');
  const { data: s, error } = await supabase.from('sites').update({ deleted_at: null }).eq('id', id).gt('deleted_at', new Date(Date.now() - 30 * 864e5).toISOString()).select('slug').single();
  if (error) redirect(`/s/baru?msg=${encodeURIComponent('Situs tidak bisa dipulihkan.')}`);
  await supabase.rpc('log_audit', { p_site: id, p_action: 'site.restore' });
  redirect(`/s/${s.slug}?msg=${encodeURIComponent('Situs dipulihkan (masih offline). Publish lagi bila sudah siap.')}`);
}
