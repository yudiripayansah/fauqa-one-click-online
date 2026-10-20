// Vercel Cron (vercel.json, tiap 15 menit): cek DNS custom domain (PRD §4.10), hapus alias subdomain lama yang kedaluwarsa,
// dan tayangkan konten terjadwal.
import { revalidateTag } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/server';
import { checkDomain, vercelConfigured } from '@/lib/domains';
import { hostTag, siteTag } from '@/lib/site/data';
import { sendEmail } from '@/lib/email';
import { APP_URL } from '@/lib/hosts';

export async function GET(req) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const db = createAdminClient();
  const stale = (d) => { revalidateTag(hostTag(d.hostname), { expire: 0 }); revalidateTag(siteTag(d.site_id), { expire: 0 }); };

  const { data: expired } = await db.from('domains').delete().eq('type', 'platform').lt('verification->>redirect_until', new Date().toISOString()).select('hostname, site_id');
  expired?.forEach(stale);

  // Jadwal terbit (PRD §4.5): halaman/artikel yang waktunya baru lewat → cache situs dibuang agar langsung tayang.
  const since = new Date(Date.now() - 16 * 60e3).toISOString();
  const now = new Date().toISOString();
  const due = await Promise.all(['pages', 'articles'].map((t) => db.from(t).select('site_id').eq('status', 'published').gt('published_at', since).lte('published_at', now)));
  for (const id of new Set(due.flatMap((r) => r.data ?? []).map((r) => r.site_id))) revalidateTag(siteTag(id), { expire: 0 });

  let checked = 0;
  if (vercelConfigured()) {
    // ponytail: 50 domain per putaran, yang paling lama belum dicek dulu; naikkan bila domain aktif > 50 × 96/hari.
    const { data: list } = await db.from('domains').select('id, site_id, hostname, status, verification, sites (name, slug)')
      .eq('type', 'custom').order('last_checked_at', { ascending: true, nullsFirst: true }).limit(50);
    for (const d of list ?? []) {
      try {
        const next = await checkDomain(d);
        await db.from('domains').update({ ...next, last_checked_at: new Date().toISOString() }).eq('id', d.id);
        checked++;
        if (next.status === d.status) continue;
        stale(d);
        if (next.status === 'misconfigured') await warnOwner(db, d);
      } catch (e) {
        console.error('cron domain', d.hostname, e.message);
      }
    }
  }
  return Response.json({ checked, expired: expired?.length ?? 0 });
}

// DNS domain aktif berubah → email owner (PRD §4.10).
async function warnOwner(db, d) {
  const { data: owner } = await db.from('site_members').select('user_id').eq('site_id', d.site_id).eq('role', 'owner').single();
  const { data: u } = await db.auth.admin.getUserById(owner.user_id);
  if (!u?.user?.email) return;
  await sendEmail({
    to: u.user.email,
    subject: `DNS ${d.hostname} bermasalah`,
    text: `Domain ${d.hostname} untuk situs ${d.sites?.name} tidak lagi mengarah ke Fauqa One Click, jadi pengunjung bisa gagal membuka situs Anda.\n\nCek record DNS di pengelola domain Anda, lalu buka ${APP_URL}/s/${d.sites?.slug}/domain dan klik "Cek sekarang".`,
  }).catch((e) => console.error('email domain', e.message));
}
