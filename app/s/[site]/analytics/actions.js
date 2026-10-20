'use server';

import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';

// Pengunjung 5 menit terakhir (dipanggil berkala oleh komponen Realtime).
export async function realtimeCount(slug) {
  const { site } = await requireSite(slug);
  const { data } = await (await createClient()).rpc('analytics_realtime', { p_site: site.id });
  return data ?? 0;
}
