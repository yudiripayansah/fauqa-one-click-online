// Data Access Layer admin. proxy.js hanya redirect cepat; otorisasi asli di sini + RLS.
import { cache } from 'react';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const ROLE_LABEL = { owner: 'Owner', admin: 'Admin', editor: 'Editor' };
// Industri wizard (PRD §4.2).
export const INDUSTRIES = [
  ['manufaktur', 'Manufaktur'], ['jasa', 'Jasa / Konsultan'], ['konstruksi', 'Konstruksi & Properti'], ['teknologi', 'Teknologi'],
  ['fnb', 'F&B'], ['pendidikan', 'Pendidikan'], ['kesehatan', 'Kesehatan'], ['umum', 'Umum'],
];
export const FORM_TYPE = { contact: 'Kontak', inquiry: 'Penawaran', newsletter: 'Newsletter' };
export const STATUS_LABEL = { draft: 'Draft', published: 'Online', unpublished: 'Offline', suspended: 'Disuspend' };

// User saat ini + situs yang ia ikuti, sekali per request. null bila belum login.
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  const [{ data: profile }, { data: sites, error }] = await Promise.all([
    supabase.from('profiles').select('name, is_platform_admin').eq('user_id', userId).maybeSingle(),
    supabase.from('site_members').select('role, sites!inner (id, name, slug, status, deleted_at, timezone:settings->>timezone)').eq('user_id', userId).is('sites.deleted_at', null),
  ]);
  if (error) throw error;
  return {
    userId, email: data.claims.email, name: profile?.name ?? '', isPlatformAdmin: !!profile?.is_platform_admin,
    sites: sites.map((m) => ({ ...m.sites, role: m.role })).sort((a, b) => a.name.localeCompare(b.name)),
  };
});

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

// Halaman /platform: hanya tim platform (profiles.is_platform_admin). Selain itu 404.
export async function requirePlatformAdmin() {
  const session = await requireSession();
  if (!session.isPlatformAdmin) notFound();
  return session;
}

// Situs aktif dari slug URL /s/[site]; 404 bila bukan anggota. `roles` membatasi peran yang boleh.
export async function requireSite(slug, roles = ['owner', 'admin', 'editor']) {
  const session = await requireSession();
  const site = session.sites.find((s) => s.slug === slug);
  if (!site) notFound();
  if (!roles.includes(site.role)) redirect(`/s/${slug}?msg=${encodeURIComponent('Peran Anda tidak bisa membuka halaman itu.')}`);
  return { session, site };
}
