'use server';

// Pengaturan situs (PRD §4.11, §5). Owner/admin; hapus situs hanya owner.
import { redirect } from 'next/navigation';
import { contentAction, revalidateSite, str, ids, go } from '@/lib/content';
import { hashPassword } from '@/lib/password';
import { TIMEZONES } from '@/lib/tz';
import { INTEGRATION_RULES } from '@/lib/site/integrations';

const OA = ['owner', 'admin'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const url = (v) => (/^https?:\/\/\S+$/.test(v) ? v : '');

async function patch(fd, tab, build, extraCols = {}) {
  const { site, slug, supabase } = await contentAction(fd, OA);
  const { data: s } = await supabase.from('sites').select('settings').eq('id', site.id).single();
  const settings = { ...s.settings, ...build(s.settings ?? {}) };
  const { error } = await supabase.from('sites').update({ settings, ...extraCols }).eq('id', site.id);
  if (error) go(`/s/${slug}/pengaturan?tab=${tab}`, error.message);
  revalidateSite(site);
  return { site, slug, supabase };
}

export async function saveGeneral(fd) {
  const name = str(fd, 'name', 120);
  if (!name) go(`/s/${fd.get('site')}/pengaturan`, 'Isi nama situs.');
  const tz = TIMEZONES.some((t) => t[0] === fd.get('timezone')) ? String(fd.get('timezone')) : 'Asia/Jakarta';
  const { slug } = await patch(fd, 'umum', () => ({ tagline: str(fd, 'tagline', 200), logo_file: ids(fd, 'logo')[0] ?? null, favicon_file: ids(fd, 'favicon')[0] ?? null, timezone: tz }), { name });
  go(`/s/${slug}/pengaturan`, 'Pengaturan disimpan.');
}

export async function saveContact(fd) {
  const email = str(fd, 'email', 200).toLowerCase();
  if (email && !EMAIL.test(email)) go(`/s/${fd.get('site')}/pengaturan?tab=kontak`, 'Email tidak valid.');
  const { slug } = await patch(fd, 'kontak', () => ({
    contact: { email, phone: str(fd, 'phone', 40), whatsapp: str(fd, 'whatsapp', 20).replace(/[^\d]/g, '').replace(/^0/, '62'), address: str(fd, 'address', 500) },
    hours: str(fd, 'hours', 500),
    social: Object.fromEntries(['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok', 'x'].map((k) => [k, url(str(fd, k, 300))]).filter(([, v]) => v)),
  }));
  go(`/s/${slug}/pengaturan?tab=kontak`, 'Kontak disimpan.');
}

export async function saveSeo(fd) {
  const { slug } = await patch(fd, 'seo', () => ({
    seo: { title: str(fd, 'seo_title', 120), description: str(fd, 'seo_description', 320), image_file: ids(fd, 'seo_image')[0] ?? null },
    robots_txt: str(fd, 'robots_txt', 4000),
  }));
  go(`/s/${slug}/pengaturan?tab=seo`, 'SEO disimpan.');
}

export async function saveLanguages(fd) {
  const { site, slug, supabase } = await contentAction(fd, OA);
  const primary = fd.get('default_locale') === 'en' ? 'en' : 'id';
  const second = primary === 'id' ? 'en' : 'id';
  const locales = fd.get('second') === 'on' ? [primary, second] : [primary];
  const { error } = await supabase.from('sites').update({ default_locale: primary, locales }).eq('id', site.id);
  if (error) go(`/s/${slug}/pengaturan?tab=bahasa`, error.message);
  revalidateSite(site);
  go(`/s/${slug}/pengaturan?tab=bahasa`, 'Bahasa disimpan.');
}

export async function saveIntegrations(fd) {
  const integrations = {};
  for (const [k, re] of Object.entries(INTEGRATION_RULES)) {
    let v = str(fd, k, 200);
    if (k === 'gsc') v = /content="([^"]+)"/.exec(v)?.[1] ?? v; // boleh tempel seluruh meta tag
    if (k !== 'pixel' && k !== 'gsc') v = v.toUpperCase();
    if (v && !re.test(v)) go(`/s/${fd.get('site')}/pengaturan?tab=integrasi`, `Format ${({ ga4: 'GA4 Measurement ID', pixel: 'Meta Pixel ID', gtm: 'GTM Container ID', gsc: 'kode verifikasi Search Console' })[k]} tidak valid.`);
    if (v) integrations[k] = v;
  }
  const { slug, site, supabase } = await patch(fd, 'integrasi', () => ({ integrations }));
  await supabase.rpc('log_audit', { p_site: site.id, p_action: 'site.integrations', p_detail: { keys: Object.keys(integrations) } });
  go(`/s/${slug}/pengaturan?tab=integrasi`, 'Integrasi disimpan.');
}

export async function saveAdvanced(fd) {
  const { site, slug, supabase } = await contentAction(fd, OA);
  const { data: s } = await supabase.from('sites').select('settings').eq('id', site.id).single();
  const head = str(fd, 'head_code', 20000);
  const cols = { settings: { ...s.settings, head_code: head } };
  const pw = String(fd.get('password') ?? '');
  if (fd.get('password_off') === 'on') cols.password_hash = null;
  else if (pw) {
    if (pw.length < 4) go(`/s/${slug}/pengaturan?tab=lanjutan`, 'Password situs minimal 4 karakter.');
    cols.password_hash = hashPassword(pw);
  }
  const { error } = await supabase.from('sites').update(cols).eq('id', site.id);
  if (error) go(`/s/${slug}/pengaturan?tab=lanjutan`, error.message);
  if (head !== (s.settings?.head_code ?? '')) await supabase.rpc('log_audit', { p_site: site.id, p_action: 'site.head_code', p_detail: { length: head.length } });
  if ('password_hash' in cols) await supabase.rpc('log_audit', { p_site: site.id, p_action: cols.password_hash ? 'site.password.on' : 'site.password.off' });
  revalidateSite(site);
  go(`/s/${slug}/pengaturan?tab=lanjutan`, 'Pengaturan lanjutan disimpan.');
}

// Soft delete (PRD §4.1): pulih dalam 30 hari dari halaman "Buat website", lalu dihapus permanen oleh cron.
export async function deleteSite(fd) {
  const { site, supabase } = await contentAction(fd, ['owner']);
  if (str(fd, 'confirm', 200) !== site.slug) go(`/s/${site.slug}/pengaturan?tab=hapus`, 'Ketik alamat situs dengan benar untuk menghapus.');
  const { error } = await supabase.from('sites').update({ deleted_at: new Date().toISOString(), status: 'unpublished' }).eq('id', site.id);
  if (error) go(`/s/${site.slug}/pengaturan?tab=hapus`, error.message);
  await supabase.rpc('log_audit', { p_site: site.id, p_action: 'site.delete' });
  revalidateSite(site);
  redirect(`/?msg=${encodeURIComponent(`${site.name} dihapus. Bisa dipulihkan dalam 30 hari.`)}`);
}
