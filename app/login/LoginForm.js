'use client';

import { useActionState, useState } from 'react';
import { inputCls, btn } from '@/components/admin/ui';
import { login, requestReset } from './actions';

export default function LoginForm({ next }) {
  const [mode, setMode] = useState('login');
  const [state, action, pending] = useActionState(mode === 'login' ? login : requestReset, {});

  if (state.sent) {
    return <p role="status" className="mt-6 text-sm">Bila <b>{state.email}</b> terdaftar, link untuk membuat password baru sudah dikirim. Cek kotak masuk email.</p>;
  }
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="next" value={next ?? ''} />
      <div>
        <label htmlFor="email" className="block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" required autoFocus autoComplete="username" defaultValue={state.email} className={`${inputCls} mt-1.5`} />
      </div>
      {mode === 'login' && (
        <div>
          <label htmlFor="password" className="block text-sm font-medium">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password"
            aria-invalid={state.error ? true : undefined} aria-describedby={state.error ? 'login-error' : undefined} className={`${inputCls} mt-1.5`} />
        </div>
      )}
      {state.error && <p id="login-error" role="alert" className="text-sm text-danger">{state.error}</p>}
      <button type="submit" disabled={pending} className={`${btn.primary} w-full py-2.5`}>
        {pending ? 'Memproses…' : mode === 'login' ? 'Masuk' : 'Kirim link reset'}
      </button>
      <button type="button" className={`${btn.ghost} w-full justify-center`} onClick={() => setMode(mode === 'login' ? 'reset' : 'login')}>
        {mode === 'login' ? 'Lupa password?' : 'Kembali ke login'}
      </button>
    </form>
  );
}
