'use server';

// Laporan penyalahgunaan (PRD §8.2) → abuse_reports + email ke platform admin agar bisa suspend dalam hitungan menit.
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyTurnstile } from '@/lib/site/contact';
import { sendEmail } from '@/lib/email';
import { APP_URL, classifyHost } from '@/lib/hosts';

const REASONS = ['phishing', 'scam', 'spam', 'lainnya'];

// Situs dari slug, alamat subdomain, atau custom domain yang ditempel pelapor.
async function findSite(db, input) {
  const raw = String(input ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '');
  if (!raw) return null;
  const kind = /^[a-z0-9-]+$/.test(raw) ? { slug: raw } : classifyHost(raw);
  if (kind.slug) return (await db.from('sites').select('id, name, slug').eq('slug', kind.slug).maybeSingle()).data;
  if (kind.custom) {
    const { data: d } = await db.from('domains').select('site_id').eq('hostname', kind.custom).maybeSingle();
    return d && (await db.from('sites').select('id, name, slug').eq('id', d.site_id).maybeSingle()).data;
  }
  return null;
}

export async function report(_prev, fd) {
  const values = { situs: String(fd.get('situs') ?? ''), reason: String(fd.get('reason') ?? ''), detail: String(fd.get('detail') ?? '').trim().slice(0, 2000), email: String(fd.get('email') ?? '').trim().slice(0, 200) };
  if (fd.get('website')) return { ok: true }; // honeypot
  if (!REASONS.includes(values.reason)) return { error: 'Pilih alasan laporan.', values };
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return { error: 'Email tidak valid.', values };
  const ip = ((await headers()).get('x-forwarded-for') ?? '').split(',')[0].trim();
  if (!(await verifyTurnstile(fd.get('cf-turnstile-response'), ip))) return { error: 'Verifikasi anti-spam gagal. Coba lagi.', values };
  const db = createAdminClient();
  const site = await findSite(db, values.situs);
  if (!site) return { error: 'Situs tidak ditemukan. Tempel alamat lengkap situsnya.', values };
  const { count } = await db.from('abuse_reports').select('id', { count: 'exact', head: true }).eq('site_id', site.id).gte('created_at', new Date(Date.now() - 36e5).toISOString());
  if (count >= 20) return { ok: true }; // ponytail: batas kasar per situs per jam; cukup untuk menahan banjir laporan
  const { error } = await db.from('abuse_reports').insert({ site_id: site.id, reason: values.reason, detail: values.detail, reporter_email: values.email || null });
  if (error) return { error: 'Laporan gagal dikirim. Coba lagi.', values };

  const { data: admins } = await db.from('profiles').select('user_id').eq('is_platform_admin', true);
  const emails = (await Promise.all((admins ?? []).map((a) => db.auth.admin.getUserById(a.user_id).then((r) => r.data?.user?.email)))).filter(Boolean);
  if (emails.length) {
    await sendEmail({ to: emails, subject: `Laporan ${values.reason}: ${site.name}`, text: `Situs ${site.name} (${site.slug}) dilaporkan sebagai ${values.reason}.\n\n${values.detail || '(tanpa detail)'}\n\nTinjau: ${APP_URL}/platform/laporan` })
      .catch((e) => console.error('[abuse:email]', e.message));
  }
  return { ok: true };
}
