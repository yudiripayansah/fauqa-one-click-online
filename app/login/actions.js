'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { APP_URL } from '@/lib/hosts';

// Hanya redirect ke path internal (cegah open redirect lewat ?next=).
const safeNext = (next) => (typeof next === 'string' && /^\/(?!\/)/.test(next) ? next : '/');

export async function login(_prev, formData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: String(formData.get('password') ?? '') });
  if (error?.code === 'email_not_confirmed') return { error: 'Email belum diverifikasi. Cek kotak masuk untuk link verifikasi.', email };
  if (error) return { error: 'Email atau password salah.', email };
  redirect(safeNext(formData.get('next')));
}

export async function signup(_prev, formData) {
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');
  if (!name) return { error: 'Isi nama Anda.', name, email };
  if (password.length < 8) return { error: 'Password minimal 8 karakter.', name, email };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    // ref: sumber pendaftaran dari landing page / badge situs (?ref=<slug>), untuk metrik akuisisi.
    email, password, options: { data: { name, ref: /^[a-z0-9-]{1,40}$/.test(String(formData.get('ref'))) ? String(formData.get('ref')) : null }, emailRedirectTo: `${APP_URL}/auth/confirm` },
  });
  if (error) return { error: error.code === 'user_already_exists' ? 'Email ini sudah terdaftar. Silakan masuk.' : error.message, name, email };
  // Konfirmasi email dimatikan di Supabase → langsung login.
  if (data.session) redirect('/s/baru');
  return { sent: true, email };
}

// `next` (opsional): kembali ke halaman itu setelah masuk lagi, mis. link undangan.
export async function logout(formData) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const next = formData?.get?.('next');
  redirect(typeof next === 'string' && /^\/(?!\/)/.test(next) ? `/login?next=${encodeURIComponent(next)}` : '/login');
}

// Kirim link reset password; respons selalu sama agar email terdaftar tidak bisa ditebak.
export async function requestReset(_prev, formData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (email) {
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${APP_URL}/auth/confirm?next=/akun/password` });
  }
  return { sent: true, email };
}
