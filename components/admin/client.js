'use client';

// Komponen interaktif admin: tombol submit, konfirmasi, toast, salin.
import { useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { btn } from './ui';

export function SubmitButton({ children, pendingText = 'Menyimpan…', className = btn.primary, ...props }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className} {...props}>
      {pending ? pendingText : children}
    </button>
  );
}

// Tombol yang membuka <dialog> konfirmasi; "Ya" men-submit form `action`.
export function ConfirmButton({ action, fields = {}, title, message, confirmLabel = 'Hapus', children, className = btn.danger }) {
  const ref = useRef(null);
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.showModal()}>{children}</button>
      <dialog ref={ref} className="m-auto w-[min(92vw,26rem)] rounded-card border border-line bg-surface p-6 text-ink backdrop:bg-black/40">
        <h2 className="font-semibold">{title}</h2>
        {message && <p className="mt-2 text-sm text-muted">{message}</p>}
        <form action={action} className="mt-6 flex justify-end gap-2">
          {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <button type="button" className={btn.secondary} onClick={() => ref.current?.close()}>Batal</button>
          <SubmitButton className={`${btn.primary} bg-danger`} pendingText="Memproses…">{confirmLabel}</SubmitButton>
        </form>
      </dialog>
    </>
  );
}

// Toast dari query `?msg=...` (dipasang setelah redirect Server Action), lalu param dibersihkan.
export function Flash() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const msg = params.get('msg');

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      next.delete('msg');
      router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
    }, 3500);
    return () => clearTimeout(t);
  }, [msg, params, pathname, router]);

  if (!msg) return null;
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-sm text-bg shadow-lg">
      {msg}
    </div>
  );
}

export function CopyButton({ text, children = 'Salin', className = btn.secondary }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={className} onClick={async () => {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    }}>
      {done ? 'Tersalin' : children}
    </button>
  );
}
