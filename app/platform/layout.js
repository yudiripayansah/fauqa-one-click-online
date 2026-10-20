import { Suspense } from 'react';
import Link from 'next/link';
import { Flash } from '@/components/admin/client';
import { Brand } from '@/components/admin/AuthShell';
import PlatformNav from '@/components/admin/PlatformNav';
import { requirePlatformAdmin } from '@/lib/dal';
import { logout } from '@/app/login/actions';

export const metadata = { title: { default: 'Platform', template: '%s · Platform · Fauqa One Click' } };

async function Guard({ children }) {
  await requirePlatformAdmin();
  return children;
}

// Platform admin (PRD §5): tim Fauqa One Click mengelola semua situs.
export default function PlatformLayout({ children }) {
  return (
    <div className="min-h-dvh md:flex">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="px-4 py-4 md:px-5 md:py-6">
          <Link href="/"><Brand className="text-lg" /></Link>
          <p className="mt-1 text-xs font-semibold text-danger">Platform admin</p>
        </div>
        <div className="px-3 pb-3 md:flex-1"><PlatformNav /></div>
        <form action={logout} className="hidden border-t border-line p-3 md:block"><button className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:text-ink">Keluar</button></form>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">
        <Suspense fallback={<div className="h-40" aria-busy="true" />}><Guard>{children}</Guard></Suspense>
      </main>
      <Suspense><Flash /></Suspense>
    </div>
  );
}
