'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireSite, ROLE_LABEL } from '@/lib/dal';
import { sendEmail } from '@/lib/email';
import { APP_URL } from '@/lib/hosts';

const back = (slug, msg) => redirect(`/s/${slug}/anggota?msg=${encodeURIComponent(msg)}`);

export async function invite(_prev, formData) {
  const slug = String(formData.get('site'));
  const { site, session } = await requireSite(slug, ['owner', 'admin']);
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const role = formData.get('role') === 'admin' ? 'admin' : 'editor';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'Email tidak valid.' };

  const supabase = await createClient();
  const [{ count }, { data: plan }] = await Promise.all([
    supabase.from('site_members').select('*', { count: 'exact', head: true }).eq('site_id', site.id),
    supabase.from('sites').select('plans (limits)').eq('id', site.id).single(),
  ]);
  const max = plan?.plans?.limits?.members;
  if (max != null && count >= max) return { error: `Batas ${max} anggota per situs sudah tercapai.` };
  // Undang ulang email yang sama = perpanjang 7 hari.
  const { data: inv, error } = await supabase.from('site_invites').upsert(
    { site_id: site.id, email, role, expires_at: new Date(Date.now() + 7 * 864e5).toISOString(), accepted_at: null },
    { onConflict: 'site_id,email' }).select('token').single();
  if (error) return { error: error.message };
  await supabase.rpc('log_audit', { p_site: site.id, p_action: 'member.invite', p_detail: { email, role } });
  revalidatePath(`/s/${slug}/anggota`);
  try {
    await sendEmail({
      to: email,
      replyTo: session.email,
      subject: `Undangan mengelola website ${site.name}`,
      text: `${session.name || session.email} mengundang Anda sebagai ${ROLE_LABEL[role]} website ${site.name} di Fauqa One Click.\n\nTerima undangan (berlaku 7 hari):\n${APP_URL}/undangan/${inv.token}\n\nMasuk atau daftar dengan email ${email}.`,
    });
  } catch (e) {
    console.error('[invite:email]', e.message);
    return { ok: `Undangan untuk ${email} dibuat, tetapi email gagal terkirim. Salin link-nya di bawah.` };
  }
  return { ok: `Undangan dikirim ke ${email}. Link-nya juga bisa disalin di bawah.` };
}

export async function revokeInvite(formData) {
  const slug = String(formData.get('site'));
  const { site } = await requireSite(slug, ['owner', 'admin']);
  const supabase = await createClient();
  await supabase.from('site_invites').delete().eq('id', String(formData.get('id'))).eq('site_id', site.id);
  back(slug, 'Undangan dibatalkan.');
}

export async function changeRole(formData) {
  const slug = String(formData.get('site'));
  const { site } = await requireSite(slug, ['owner', 'admin']);
  const role = formData.get('role') === 'admin' ? 'admin' : 'editor';
  const user = String(formData.get('user'));
  const supabase = await createClient();
  const { data } = await supabase.from('site_members').update({ role }).eq('site_id', site.id).eq('user_id', user).select('user_id');
  if (!data?.length) back(slug, 'Peran tidak bisa diubah.');
  await supabase.rpc('log_audit', { p_site: site.id, p_action: 'member.role', p_detail: { user, role } });
  back(slug, 'Peran diperbarui.');
}

export async function removeMember(formData) {
  const slug = String(formData.get('site'));
  const { session, site } = await requireSite(slug);
  const user = String(formData.get('user'));
  const supabase = await createClient();
  const { data } = await supabase.from('site_members').delete().eq('site_id', site.id).eq('user_id', user).select('user_id');
  if (!data?.length) back(slug, 'Anggota tidak bisa dihapus.');
  await supabase.rpc('log_audit', { p_site: site.id, p_action: 'member.remove', p_detail: { user } });
  if (user === session.userId) redirect('/');
  back(slug, 'Anggota dihapus.');
}
