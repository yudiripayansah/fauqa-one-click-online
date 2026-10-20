'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadFile } from './actions';

// Unggah banyak file sekaligus (drag-and-drop atau pilih), satu per satu ke folder aktif.
export default function Uploader({ site, folder, accept }) {
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [log, setLog] = useState([]);
  const [pending, start] = useTransition();
  const run = (files) => start(async () => {
    setLog(files.map((f) => ({ name: f.name, state: 'Menunggu…' })));
    for (const [i, file] of files.entries()) {
      setLog((l) => l.map((x, j) => (j === i ? { ...x, state: 'Mengunggah…' } : x)));
      const fd = new FormData();
      fd.set('site', site); fd.set('folder', folder); fd.set('file', file);
      const res = await uploadFile(fd).catch((e) => ({ error: `${file.name}: ${e.message}` }));
      setLog((l) => l.map((x, j) => (j === i ? { ...x, state: res.error ?? 'Selesai', error: !!res.error } : x)));
    }
    router.refresh();
  });
  return (
    <div>
      <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!pending) run([...e.dataTransfer.files]); }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-card border-2 border-dashed px-6 py-8 text-center text-sm ${over ? 'border-accent bg-accent-tint' : 'border-line bg-surface'}`}>
        <span className="font-medium">{pending ? 'Mengunggah…' : 'Tarik file ke sini atau klik untuk memilih'}</span>
        <span className="mt-1 text-xs text-muted">Gambar 10 MB · video 50 MB · PDF/Office 20 MB. Gambar otomatis dibuat versi WebP.</span>
        <input type="file" multiple accept={accept} className="sr-only" disabled={pending} onChange={(e) => { run([...e.target.files]); e.target.value = ''; }} />
      </label>
      {log.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm" aria-live="polite">
          {log.map((l, i) => <li key={i} className={l.error ? 'text-danger' : 'text-muted'}><span className="text-ink">{l.name}</span> — {l.state}</li>)}
        </ul>
      )}
    </div>
  );
}
