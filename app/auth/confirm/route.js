// Link dari email Supabase: verifikasi pendaftaran, reset password, undangan.
// Mendukung template token_hash (?token_hash=&type=) maupun PKCE (?code=).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const TYPES = ['signup', 'email', 'recovery', 'invite', 'magiclink'];
const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)/.test(n) ? n : null);

export async function GET(req) {
  const { searchParams } = req.nextUrl;
  const supabase = await createClient();
  const code = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  let error = true;
  if (code) ({ error } = await supabase.auth.exchangeCodeForSession(code));
  else if (token_hash && TYPES.includes(type)) ({ error } = await supabase.auth.verifyOtp({ token_hash, type }));
  if (error) return NextResponse.redirect(new URL('/login?msg=link-kedaluwarsa', req.url));
  const dest = type === 'recovery' ? '/akun/password' : safeNext(searchParams.get('next')) ?? '/';
  return NextResponse.redirect(new URL(dest, req.url));
}
