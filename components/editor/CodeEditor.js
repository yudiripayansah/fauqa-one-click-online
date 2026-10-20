'use client';

// Editor kode theme (PRD §4.4): pohon file, Monaco (Liquid/JSON/CSS/JS), simpan tervalidasi, riwayat 20 versi + revert.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Editor from '@monaco-editor/react';
import { btn, inputCls } from '@/components/admin/ui';
import { createFile, deleteFile, listVersions, openFile, renameFile, saveFile, uploadAsset } from '@/app/editor/code-actions';

const FOLDERS = ['layout', 'templates', 'sections', 'snippets', 'assets', 'config', 'locales'];
const LANG = { liquid: 'liquid', json: 'json', css: 'css', js: 'javascript', svg: 'xml' };
const fmt = (d) => new Intl.DateTimeFormat('id', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(d));

export default function CodeEditor({ site, theme, initialFiles, initialKey }) {
  const [files, setFiles] = useState(initialFiles);
  const [key, setKey] = useState(initialKey);
  const [doc, setDoc] = useState(null);           // { content, updatedAt } | { binary, url }
  const [value, setValue] = useState('');
  const [problems, setProblems] = useState({ errors: [], warnings: [] });
  const [status, setStatus] = useState(null);
  const [versions, setVersions] = useState(null);
  const [busy, setBusy] = useState(false);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const dirty = doc && !doc.binary && value !== doc.content;

  const apply = useCallback((k, res) => {
    if (res.error) return setStatus({ type: 'error', text: res.error });
    setDoc(res);
    setValue(res.content ?? '');
    window.history.replaceState(null, '', `?file=${encodeURIComponent(k)}`);
  }, []);
  // Buka file (dipanggil dari aksi pengguna).
  const load = useCallback(async (k) => {
    setKey(k); setDoc(null); setVersions(null); setProblems({ errors: [], warnings: [] }); setStatus(null);
    apply(k, await openFile({ site, themeId: theme.id, key: k }));
  }, [site, theme.id, apply]);

  useEffect(() => {
    let alive = true;
    openFile({ site, themeId: theme.id, key: initialKey }).then((res) => alive && apply(initialKey, res));
    return () => { alive = false; };
  }, [site, theme.id, initialKey, apply]);

  // Tanda error/peringatan di gutter Monaco.
  useEffect(() => {
    const m = monacoRef.current;
    const model = editorRef.current?.getModel();
    if (!m || !model) return;
    m.editor.setModelMarkers(model, 'fauqa', [
      ...problems.errors.map((p) => ({ severity: m.MarkerSeverity.Error, message: p.message, startLineNumber: p.line ?? 1, endLineNumber: p.line ?? 1, startColumn: 1, endColumn: 999 })),
      ...problems.warnings.map((p) => ({ severity: m.MarkerSeverity.Warning, message: p.message, startLineNumber: p.line ?? 1, endLineNumber: p.line ?? 1, startColumn: 1, endColumn: 999 })),
    ]);
  }, [problems]);

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function save() {
    if (!dirty || busy) return;
    setBusy(true);
    const res = await saveFile({ site, themeId: theme.id, key, content: value, expected: doc.updatedAt });
    setBusy(false);
    setProblems({ errors: res.errors ?? [], warnings: res.warnings ?? [] });
    if (res.errors?.length) return setStatus({ type: 'error', text: res.conflict ? res.errors[0].message : `Belum disimpan: ${res.errors.length} error. File yang tayang tidak berubah.` });
    setDoc({ content: value, updatedAt: res.updatedAt });
    setVersions(null);
    setStatus({ type: 'ok', text: res.warnings?.length ? `Tersimpan dengan ${res.warnings.length} peringatan.` : 'Tersimpan.' });
  }
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });

  const choose = (k) => {
    if (k === key) return;
    if (dirty && !window.confirm('Perubahan file ini belum disimpan. Tinggalkan?')) return;
    load(k);
  };

  async function act(fn, args, after) {
    setBusy(true);
    const res = await fn({ site, themeId: theme.id, ...args });
    setBusy(false);
    if (res.error) return setStatus({ type: 'error', text: res.error });
    after?.(res);
  }
  const addFile = (folder) => {
    const name = window.prompt(`Nama file baru di ${folder}/ (mis. ${folder === 'sections' ? 'promo.liquid' : folder === 'templates' ? 'page.faq.json' : folder === 'assets' ? 'custom.css' : 'nama.liquid'})`);
    if (!name) return;
    const k = `${folder}/${name.trim()}`;
    act(createFile, { key: k }, () => { setFiles((f) => [...f, { key: k, size: 0, binary: false }].sort((a, b) => a.key.localeCompare(b.key))); load(k); });
  };
  const rename = () => {
    const to = window.prompt('Nama baru', key.split('/')[1]);
    if (!to || to === key.split('/')[1]) return;
    const k = `${key.split('/')[0]}/${to.trim()}`;
    act(renameFile, { key, to: k }, () => { setFiles((f) => f.map((x) => (x.key === key ? { ...x, key: k } : x)).sort((a, b) => a.key.localeCompare(b.key))); load(k); });
  };
  const remove = () => {
    if (!window.confirm(`Hapus ${key}? Tindakan ini tidak bisa dibatalkan.`)) return;
    act(deleteFile, { key }, () => { setFiles((f) => f.filter((x) => x.key !== key)); load('layout/theme.liquid'); });
  };
  const upload = async (file) => {
    const fd = new FormData();
    fd.set('site', site); fd.set('themeId', theme.id); fd.set('file', file);
    setBusy(true);
    const res = await uploadAsset(fd);
    setBusy(false);
    if (res.error) return setStatus({ type: 'error', text: res.error });
    setFiles((f) => (f.some((x) => x.key === res.key) ? f : [...f, { key: res.key, size: file.size, binary: !/\.(css|js|json|svg)$/.test(res.key) }].sort((a, b) => a.key.localeCompare(b.key))));
    load(res.key);
  };
  const showVersions = async () => setVersions(await listVersions({ site, themeId: theme.id, key }));

  const ext = key.split('.').pop();
  return (
    <div className="flex h-dvh flex-col bg-bg text-ink">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2">
        <Link href={`/s/${site}/tema`} className={btn.ghost}>← Keluar</Link>
        <p className="truncate text-sm font-semibold">{theme.name} <span className="font-normal text-muted">· Edit kode</span></p>
        <Link href={`/editor/${site}/${theme.id}`} className={`${btn.ghost} ml-2`}>Editor visual</Link>
        <span className="mx-auto truncate font-mono text-sm text-muted">{key}{dirty && ' •'}</span>
        {doc && !doc.binary && <>
          {!/^(layout\/theme\.liquid|templates\/index\.json|templates\/page\.json|config\/settings_schema\.json)$/.test(key) && <>
            <button type="button" className={btn.ghost} onClick={rename} disabled={busy}>Ganti nama</button>
            <button type="button" className={btn.ghost} onClick={remove} disabled={busy}>Hapus</button>
          </>}
          <button type="button" className={btn.ghost} onClick={showVersions}>Riwayat</button>
          <button type="button" className={btn.primary} onClick={save} disabled={!dirty || busy} title="Simpan (Ctrl/⌘+S)">{busy ? 'Menyimpan…' : dirty ? 'Simpan' : 'Tersimpan'}</button>
        </>}
        {doc?.binary && <button type="button" className={btn.ghost} onClick={remove} disabled={busy}>Hapus</button>}
      </header>
      {status && (
        <div role={status.type === 'error' ? 'alert' : 'status'} className={`flex items-center gap-3 px-4 py-2 text-sm ${status.type === 'error' ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>
          <span className="flex-1">{status.text}</span>
          <button type="button" className={btn.ghost} onClick={() => setStatus(null)} aria-label="Tutup">✕</button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <nav aria-label="File theme" className="w-64 shrink-0 overflow-y-auto border-r border-line bg-surface py-2 text-sm">
          {FOLDERS.map((folder) => (
            <section key={folder} className="mb-2">
              <div className="flex items-center justify-between px-3 py-1">
                <h2 className="font-medium text-muted">{folder}/</h2>
                {folder === 'assets' ? (
                  <label className="cursor-pointer text-xs text-accent hover:underline">Unggah
                    <input type="file" className="sr-only" onChange={(e) => { if (e.target.files[0]) upload(e.target.files[0]); e.target.value = ''; }} />
                  </label>
                ) : folder !== 'config' && <button type="button" className="text-xs text-accent hover:underline" onClick={() => addFile(folder)}>+ Baru</button>}
              </div>
              <ul>
                {files.filter((f) => f.key.startsWith(`${folder}/`)).map((f) => (
                  <li key={f.key}>
                    <button type="button" onClick={() => choose(f.key)} aria-current={f.key === key ? 'true' : undefined}
                      className="block w-full truncate px-5 py-1 text-left font-mono text-xs hover:bg-line/40 aria-[current]:bg-accent-tint aria-[current]:text-accent">
                      {f.key.slice(folder.length + 1)}{f.binary && <span className="text-muted"> ·biner</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        <main className="flex min-w-0 flex-1 flex-col">
          {!doc ? <p className="p-6 text-sm text-muted">Memuat…</p> : doc.binary ? (
            <div className="p-6">
              {/\.(png|jpe?g|webp|gif|ico|svg)$/.test(key)
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={doc.url} alt={key} className="max-h-96 rounded-lg border border-line" />
                : <p className="text-sm text-muted">File biner ({Math.round((doc.size ?? 0) / 1024)} KB).</p>}
              <p className="mt-3 text-sm">Pakai di theme: <code className="rounded bg-line/50 px-1.5 py-0.5">{`{{ '${key.slice(7)}' | asset_url }}`}</code></p>
            </div>
          ) : (
            <div className="min-h-0 flex-1">
              <Editor
                key={key}
                language={LANG[ext] ?? 'plaintext'}
                value={value}
                onChange={(v) => setValue(v ?? '')}
                onMount={(editor, monaco) => {
                  editorRef.current = editor;
                  monacoRef.current = monaco;
                  monaco.editor.setTheme(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'light');
                  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
                }}
                options={{ minimap: { enabled: false }, fontSize: 13, tabSize: 2, wordWrap: 'on', scrollBeyondLastLine: false, automaticLayout: true }}
              />
            </div>
          )}
          {(problems.errors.length > 0 || problems.warnings.length > 0) && (
            <ul className="max-h-40 overflow-y-auto border-t border-line bg-surface px-4 py-2 text-sm" aria-label="Masalah">
              {[...problems.errors.map((p) => ['Error', 'text-danger', p]), ...problems.warnings.map((p) => ['Peringatan', 'text-muted', p])].map(([label, cls, p], i) => (
                <li key={i} className={cls}>
                  <button type="button" className="text-left hover:underline" onClick={() => p.line && editorRef.current?.revealLineInCenter(p.line) && editorRef.current?.setPosition({ lineNumber: p.line, column: 1 })}>
                    {label}{p.line ? ` · baris ${p.line}` : ''}: {p.message}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </main>

        {versions && (
          <aside className="w-72 shrink-0 overflow-y-auto border-l border-line bg-surface p-3 text-sm" aria-label="Riwayat versi">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">Riwayat ({versions.length}/20)</h2>
              <button type="button" className={btn.ghost} onClick={() => setVersions(null)} aria-label="Tutup riwayat">✕</button>
            </div>
            {versions.length === 0 ? <p className="text-muted">Belum ada versi sebelumnya.</p> : (
              <ul className="space-y-2">
                {versions.map((v) => (
                  <li key={v.id} className="rounded-lg border border-line p-2">
                    <p>{fmt(v.at)}</p>
                    {v.by && <p className="text-xs text-muted">{v.by}</p>}
                    <button type="button" className={`${btn.secondary} mt-2 w-full`} onClick={() => { setValue(v.content); setStatus({ type: 'ok', text: 'Versi lama dimuat ke editor. Simpan untuk mengembalikan.' }); }}>
                      Muat versi ini
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg p-6 text-center lg:hidden">
        <p className="text-sm">Editor kode butuh layar minimal 1024px.</p>
      </div>
    </div>
  );
}
