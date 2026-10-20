import { Suspense } from 'react';
import Link from 'next/link';
import { Flash } from '@/components/admin/client';
import { Brand } from '@/components/admin/AuthShell';
import SiteNav from '@/components/admin/SiteNav';
import { requireSession, requireSite, ROLE_LABEL } from '@/lib/dal';
import { logout } from '@/app/login/actions';

export const metadata = { title: { default: 'Dashboard', template: '%s · Fauqa One Click' } };

// Site switcher: daftar situs user + buat situs baru.
async function Switcher({ params }) {
  const { site: slug } = await params;
  const { session, site } = await requireSite(slug);
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-line/40">
        <span className="min-w-0">
          <span className="block truncate font-semibold">{site.name}</span>
          <span className="block text-xs text-muted">{ROLE_LABEL[site.role]}</span>
        </span>
        <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 shrink-0 text-muted"><path d="m6 8 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.8" /></svg>
      </summary>
      <div className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-line bg-surface p-1 shadow-lg">
        {session.sites.map((s) => (
          <Link key={s.id} href={`/s/${s.slug}`} aria-current={s.id === site.id ? 'true' : undefined}
            className="block truncate rounded-md px-3 py-2 text-sm hover:bg-line/50 aria-[current]:font-semibold">{s.name}</Link>
        ))}
        <Link href="/s/baru" className="mt-1 block rounded-md border-t border-line px-3 py-2 text-sm text-accent hover:bg-line/50">+ Buat website baru</Link>
      </div>
    </details>
  );
}

async function Account() {
  const session = await requireSession();
  return (
    <>
      <p className="truncate px-3 py-2 text-xs text-muted" title={session.email}>{session.email}</p>
      {session.isPlatformAdmin && <Link href="/platform" className="block rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-line/40">Platform admin</Link>}
    </>
  );
}

export default function SiteLayout({ children, params }) {
  return (
    <div className="min-h-dvh md:flex">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh md:w-64 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 py-4 md:px-5 md:py-6">
          <Link href="/"><Brand className="text-lg" /></Link>
          <form action={logout} className="md:hidden"><button className="text-sm text-muted hover:text-ink">Keluar</button></form>
        </div>
        <div className="space-y-3 px-3 pb-3 md:flex-1">
          <Suspense fallback={<div className="h-14 rounded-lg border border-line" />}>
            <Switcher params={params} />
          </Suspense>
          <Suspense>
            <SiteNav />
          </Suspense>
        </div>
        <div className="hidden border-t border-line p-3 md:block">
          <Suspense fallback={<p className="px-3 py-2 text-xs text-muted">…</p>}><Account /></Suspense>
          <Link href="/akun/password" className="block rounded-lg px-3 py-2 text-sm text-muted hover:text-ink">Ganti password</Link>
          <form action={logout}><button className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:text-ink">Keluar</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">{children}</main>
      <Suspense><Flash /></Suspense>
    </div>
  );
}
