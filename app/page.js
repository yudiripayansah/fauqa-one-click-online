import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/dal';

// Beranda admin → situs pertama, atau buat situs bila belum punya.
async function Go() {
  const session = await requireSession();
  redirect(session.sites[0] ? `/s/${session.sites[0].slug}` : '/s/baru');
}

export default function Home() {
  return <Suspense><Go /></Suspense>;
}
