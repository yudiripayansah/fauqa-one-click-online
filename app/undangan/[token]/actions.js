'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/dal';

export async function acceptInvite(formData) {
  await requireSession();
  const token = String(formData.get('token') ?? '');
  const supabase = await createClient();
  const { data: siteId, error } = await supabase.rpc('accept_invite', { p_token: token });
  if (error) redirect(`/undangan/${encodeURIComponent(token)}?error=${encodeURIComponent(error.message)}`);
  const { data: site } = await supabase.from('sites').select('slug').eq('id', siteId).single();
  redirect(`/s/${site.slug}?msg=${encodeURIComponent('Anda sudah bergabung.')}`);
}
