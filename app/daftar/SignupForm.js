'use client';

import { useActionState } from 'react';
import { inputCls, btn } from '@/components/admin/ui';
import { signup } from '@/app/login/actions';

export default function SignupForm({ source }) {
  const [state, action, pending] = useActionState(signup, {});
  if (state.sent) {
    return <p role="status" className="mt-6 text-sm">Link verifikasi sudah dikirim ke <b>{state.email}</b>. Buka link itu untuk mulai membuat website.</p>;
  }
  return (
    <form action={action} className="mt-6 space-y-4">
      {source && <input type="hidden" name="ref" value={source} />}
      <div>
        <label htmlFor="name" className="block text-sm font-medium">Nama Anda</label>
        <input id="name" name="name" required autoFocus autoComplete="name" defaultValue={state.name} className={`${inputCls} mt-1.5`} />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium">Email kerja</label>
        <input id="email" name="email" type="email" required autoComplete="email" defaultValue={state.email} className={`${inputCls} mt-1.5`} />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium">Password</label>
        <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className={`${inputCls} mt-1.5`} aria-describedby="pw-hint" />
        <p id="pw-hint" className="mt-1.5 text-xs text-muted">Minimal 8 karakter.</p>
      </div>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={`${btn.primary} w-full py-2.5`}>{pending ? 'Memproses…' : 'Daftar'}</button>
    </form>
  );
}
