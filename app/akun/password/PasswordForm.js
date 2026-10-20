'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { inputCls, btn } from '@/components/admin/ui';
import { changePassword } from './actions';

export default function PasswordForm() {
  const [state, action, pending] = useActionState(changePassword, {});
  if (state.ok) return <p role="status" className="mt-6 text-sm">Password tersimpan. <Link href="/" className="font-medium text-accent">Lanjut ke dashboard</Link></p>;
  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label htmlFor="password" className="block text-sm font-medium">Password baru</label>
        <input id="password" name="password" type="password" required minLength={8} autoFocus autoComplete="new-password" className={`${inputCls} mt-1.5`} />
      </div>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={`${btn.primary} w-full py-2.5`}>{pending ? 'Menyimpan…' : 'Simpan password'}</button>
    </form>
  );
}
