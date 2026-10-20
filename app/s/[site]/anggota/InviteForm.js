'use client';

import { useActionState } from 'react';
import { inputCls, inlineInputCls, btn } from '@/components/admin/ui';
import { invite } from './actions';

export default function InviteForm({ site }) {
  const [state, action, pending] = useActionState(invite, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="site" value={site} />
      <div className="min-w-56 flex-1">
        <label htmlFor="email" className="block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" required className={`${inputCls} mt-1.5`} />
      </div>
      <div>
        <label htmlFor="role" className="block text-sm font-medium">Peran</label>
        <select id="role" name="role" defaultValue="editor" className={`${inlineInputCls} mt-1.5`}>
          <option value="editor">Editor</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      <button disabled={pending} className={btn.primary}>{pending ? 'Membuat…' : 'Undang'}</button>
      {state.error && <p role="alert" className="w-full text-sm text-danger">{state.error}</p>}
      {state.ok && <p role="status" className="w-full text-sm text-success">{state.ok}</p>}
    </form>
  );
}
