import { Suspense } from 'react';
import Link from 'next/link';
import AuthShell from '@/components/admin/AuthShell';
import { btn } from '@/components/admin/ui';
import { SubmitButton } from '@/components/admin/client';
import { requireSession } from '@/lib/dal';
import { acceptInvite } from './actions';
import { logout } from '@/app/login/actions';

export const metadata = { title: 'Undangan' };

async function Invite({ params, searchParams }) {
  const [{ token }, { error }, session] = await Promise.all([params, searchParams, requireSession()]);
  return (
    <>
      <p className="mt-2 text-sm text-muted">Anda masuk sebagai <b className="text-ink">{session.email}</b>. Terima undangan untuk bergabung ke situs.</p>
      {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
      <form action={acceptInvite} className="mt-6 space-y-3">
        <input type="hidden" name="token" value={token} />
        <SubmitButton className={`${btn.primary} w-full py-2.5`} pendingText="Memproses…">Terima undangan</SubmitButton>
        <Link href="/" className={`${btn.ghost} w-full justify-center`}>Nanti saja</Link>
      </form>
      <form action={logout} className="mt-2">
        <input type="hidden" name="next" value={`/undangan/${token}`} />
        <button className={`${btn.ghost} w-full justify-center`}>Masuk dengan akun lain</button>
      </form>
    </>
  );
}

export default function InvitePage({ params, searchParams }) {
  return (
    <AuthShell title="Undangan bergabung">
      <Suspense fallback={<div className="mt-6 h-32" aria-busy="true" />}><Invite params={params} searchParams={searchParams} /></Suspense>
    </AuthShell>
  );
}
