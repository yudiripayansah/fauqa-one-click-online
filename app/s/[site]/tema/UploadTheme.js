'use client';

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { btn } from '@/components/admin/ui';
import { uploadTheme } from './actions';

// Form upload .zip + laporan validasi per file/baris.
export default function UploadTheme({ site }) {
  const [state, action, pending] = useActionState(uploadTheme, {});
  const router = useRouter();
  useEffect(() => { if (state.ok) router.refresh(); }, [state.ok, router]);
  const problems = state.report?.errors ?? [];
  const warnings = state.warnings ?? state.report?.warnings ?? [];
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="site" value={site} />
      <div className="flex flex-wrap items-center gap-3">
        <input type="file" name="file" accept=".zip,application/zip" required aria-label="File theme .zip" className="text-sm" />
        <button disabled={pending} className={btn.secondary}>{pending ? 'Memeriksa & mengunggah…' : 'Upload theme'}</button>
      </div>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      {state.ok && <p role="status" className="text-sm text-success">{state.ok}</p>}
      {problems.length > 0 && (
        <div role="alert" className="rounded-lg border border-danger/40 p-3 text-sm">
          <p className="font-medium text-danger">Upload ditolak: {problems.length} error. Perbaiki lalu upload ulang.</p>
          <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto font-mono text-xs">
            {problems.map((p, i) => <li key={i}><b>{p.file}{p.line ? `:${p.line}` : ''}</b> — {p.message}</li>)}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="space-y-1 text-xs text-muted">{warnings.map((w, i) => <li key={i}>Peringatan · {w.file}{w.line ? `:${w.line}` : ''} — {w.message}</li>)}</ul>
      )}
    </form>
  );
}
