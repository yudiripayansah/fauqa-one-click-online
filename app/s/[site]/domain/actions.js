'use server';

// Domain situs (PRD §4.10): subdomain platform + custom domain via Vercel. Owner/admin.
import { updateTag } from 'next/cache';
import { contentAction, go, revalidateSite } from '@/lib/content';
import { createAdminClient } from '@/lib/supabase/server';
import { hostTag } from '@/lib/site/data';
import { ROOT_DOMAIN } from '@/lib/hosts';
import { addToVercel, checkDomain, normalizeHostname, removeFromVercel } from '@/lib/domains';

const OA = ['owner', 'admin'];
const audit = (supabase, site, action, detail) => supabase.rpc('log_audit', { p_site: site.id, p_action: action, p_detail: detail });

async function ownDomain(fd) {
  const ctx = await contentAction(fd, OA);
  const { data: d } = await ctx.supabase.from('domains').select('*').eq('id', String(fd.get('id'))).eq('site_id', ctx.site.id).eq('type', 'custom').maybeSingle();
  if (!d) go(`/s/${ctx.slug}/domain`, 'Domain tidak ditemukan.');
  return { ...ctx, d };
}

export async function addDomain(fd) {
  const { site, slug, supabase } = await contentAction(fd, OA);
  const { hostname, error } = normalizeHostname(fd.get('hostname'));
  if (error) go(`/s/${slug}/domain`, error);
  const { data: d, error: dbErr } = await supabase.from('domains').insert({ site_id: site.id, hostname }).select('id').single();
  if (dbErr) go(`/s/${slug}/domain`, dbErr.code === '23505' ? 'Domain ini sudah dipakai situs lain.' : dbErr.message);
  try {
    const { verification } = await addToVercel(hostname);
    await createAdminClient().from('domains').update({ verification }).eq('id', d.id);
  } catch (e) {
    await supabase.from('domains').delete().eq('id', d.id);
    go(`/s/${slug}/domain`, `Domain tidak bisa didaftarkan: ${e.message}`);
  }
  await audit(supabase, site, 'domain.add', { hostname });
  go(`/s/${slug}/domain`, `${hostname} ditambahkan. Buat record DNS di bawah, lalu klik "Cek sekarang".`);
}

export async function checkNow(fd) {
  const { site, slug, d } = await ownDomain(fd);
  let msg;
  try {
    const next = await checkDomain(d);
    await createAdminClient().from('domains').update({ ...next, last_checked_at: new Date().toISOString() }).eq('id', d.id);
    msg = next.status === 'active' ? `${d.hostname} aktif.` : 'DNS belum mengarah ke Fauqa One Click. Perubahan DNS bisa butuh beberapa menit sampai 48 jam.';
  } catch (e) {
    msg = `Gagal mengecek: ${e.message}`;
  }
  updateTag(hostTag(d.hostname));
  revalidateSite(site);
  go(`/s/${slug}/domain`, msg);
}

export async function setPrimary(fd) {
  const { site, slug, supabase } = await contentAction(fd, OA);
  const id = String(fd.get('id') ?? '');
  const { error } = await supabase.from('sites').update({ primary_domain_id: id || null }).eq('id', site.id);
  if (error) go(`/s/${slug}/domain`, error.message);
  await audit(supabase, site, 'domain.primary', { id: id || null });
  revalidateSite(site);
  go(`/s/${slug}/domain`, id ? 'Domain utama diganti. Alamat lain sekarang redirect ke domain ini.' : 'Subdomain platform jadi alamat utama.');
}

export async function removeDomain(fd) {
  const { site, slug, supabase, d } = await ownDomain(fd);
  await supabase.from('sites').update({ primary_domain_id: null }).eq('id', site.id).eq('primary_domain_id', d.id);
  try { await removeFromVercel(d.hostname); } catch (e) { console.error('vercel remove', e.message); }
  const { error } = await supabase.from('domains').delete().eq('id', d.id);
  if (error) go(`/s/${slug}/domain`, error.message);
  await audit(supabase, site, 'domain.remove', { hostname: d.hostname });
  updateTag(hostTag(d.hostname));
  revalidateSite(site);
  go(`/s/${slug}/domain`, `${d.hostname} dihapus.`);
}

// Ganti subdomain platform: alamat lama tetap redirect 30 hari (alias domain type 'platform').
export async function changeSlug(fd) {
  const { site, slug, supabase } = await contentAction(fd, OA);
  const next = String(fd.get('slug') ?? '').trim().toLowerCase();
  if (next === slug) go(`/s/${slug}/domain`);
  if (!/^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/.test(next)) go(`/s/${slug}/domain`, 'Pakai huruf kecil, angka, dan tanda hubung (maks. 40 karakter).');
  const admin = createAdminClient();
  const { data: reserved } = await admin.rpc('is_reserved_slug', { p_slug: next });
  if (reserved) go(`/s/${slug}/domain`, `Alamat "${next}" tidak bisa dipakai.`);
  const { error } = await supabase.from('sites').update({ slug: next }).eq('id', site.id);
  if (error) go(`/s/${slug}/domain`, error.code === '23505' ? 'Alamat ini sudah dipakai situs lain.' : error.message);
  const oldHost = `${slug}.${ROOT_DOMAIN}`;
  await admin.from('domains').delete().eq('site_id', site.id).eq('type', 'platform').eq('hostname', `${next}.${ROOT_DOMAIN}`);
  await admin.from('domains').upsert({ site_id: site.id, hostname: oldHost, type: 'platform', status: 'active',
    verification: { redirect_until: new Date(Date.now() + 30 * 864e5).toISOString() } }, { onConflict: 'hostname' });
  await audit(supabase, site, 'site.slug', { from: slug, to: next });
  updateTag(hostTag(oldHost));
  revalidateSite(site);
  go(`/s/${next}/domain`, `Alamat diganti. ${oldHost} redirect ke alamat baru selama 30 hari.`);
}
