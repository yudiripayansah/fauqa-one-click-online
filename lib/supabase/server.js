// Klien Supabase server-side. JANGAN import dari Client Component.
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookieOptions } from './cookies';

// Atas nama user yang login (RLS aktif). Dipakai untuk semua query & action admin.
export async function createClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookieOptions,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Dari Server Component set cookie tidak diizinkan; proxy.js yang me-refresh session.
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch {}
      },
    },
  });
}

// Service role (bypass RLS). HANYA untuk render situs publik & proses sistem.
export const createAdminClient = () =>
  createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
