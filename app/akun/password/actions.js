'use server';

import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/dal';

export async function changePassword(_prev, formData) {
  await requireSession();
  const password = String(formData.get('password') ?? '');
  if (password.length < 8) return { error: 'Password minimal 8 karakter.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  return error ? { error: error.message } : { ok: true };
}
