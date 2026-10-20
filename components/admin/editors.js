'use client';

// Kontrol form konten: rich text (TipTap), pemilih file + unggah, daftar label–nilai. Nilai dikirim lewat <input type="hidden">.
import { useEffect, useRef, useState, useTransition } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { btn, inputCls, inlineInputCls } from './ui';
import { listFiles, uploadFile } from '@/app/s/[site]/file/actions';

const tool = 'rounded-md px-2 py-1 text-sm text-muted hover:bg-line/60 hover:text-ink aria-pressed:bg-accent-tint aria-pressed:text-accent';

export function RichText({ name, defaultValue = '', site, id, minHeight = 'min-h-48', onChange }) {
  const [html, setHtml] = useState(defaultValue);
  const [picking, setPicking] = useState(false);
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: { openOnClick: false, autolink: true } }), Image],
    content: defaultValue,
    immediatelyRender: false,
    editorProps: { attributes: { class: `rte-admin ${minHeight} px-3 py-2 outline-none`, ...(id ? { id } : {}) } },
    onUpdate: ({ editor: e }) => { const v = e.isEmpty ? '' : e.getHTML(); setHtml(v); onChange?.(v); },
  });
  if (!editor) return <div className={`${minHeight} rounded-lg border border-line bg-surface`} aria-busy="true" />;
  const b = (label, active, run, title) => (
    <button type="button" className={tool} aria-pressed={active} title={title ?? label} onClick={() => run(editor.chain().focus()).run()}>{label}</button>
  );
  const link = () => {
    const prev = editor.getAttributes('link').href ?? '';
    const href = window.prompt('URL link (kosongkan untuk menghapus)', prev);
    if (href === null) return;
    if (!href) editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };
  return (
    <div className="rounded-lg border border-line bg-surface focus-within:outline-2 focus-within:outline-accent">
      <div className="flex flex-wrap gap-0.5 border-b border-line p-1" role="toolbar" aria-label="Format teks">
        {b('B', editor.isActive('bold'), (c) => c.toggleBold(), 'Tebal')}
        {b('I', editor.isActive('italic'), (c) => c.toggleItalic(), 'Miring')}
        {b('H2', editor.isActive('heading', { level: 2 }), (c) => c.toggleHeading({ level: 2 }), 'Judul')}
        {b('H3', editor.isActive('heading', { level: 3 }), (c) => c.toggleHeading({ level: 3 }), 'Subjudul')}
        {b('• Daftar', editor.isActive('bulletList'), (c) => c.toggleBulletList())}
        {b('1. Daftar', editor.isActive('orderedList'), (c) => c.toggleOrderedList())}
        {b('Kutipan', editor.isActive('blockquote'), (c) => c.toggleBlockquote())}
        <button type="button" className={tool} aria-pressed={editor.isActive('link')} onClick={link}>Link</button>
        {site && <button type="button" className={tool} onClick={() => setPicking(true)}>Gambar</button>}
        <span className="mx-1 w-px bg-line" />
        {b('Urungkan', false, (c) => c.undo())}
        {b('Ulangi', false, (c) => c.redo())}
      </div>
      <EditorContent editor={editor} />
      {name && <input type="hidden" name={name} value={html} />}
      {picking && (
        <FileDialog site={site} kind="image" onClose={() => setPicking(false)}
          onPick={(f) => { editor.chain().focus().setImage({ src: f.large, alt: f.alt || '' }).run(); setPicking(false); }} />
      )}
    </div>
  );
}

// Dialog pustaka file: cari, unggah, pilih. onPick(file) dipanggil per file.
export function FileDialog({ site, kind = 'any', multiple = false, onPick, onClose }) {
  const ref = useRef(null);
  const [files, setFiles] = useState(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  useEffect(() => {
    ref.current?.showModal();
    listFiles(site, kind).then(setFiles);
  }, [site, kind]);
  const upload = (list) => start(async () => {
    setError('');
    for (const file of list) {
      const fd = new FormData();
      fd.set('site', site);
      fd.set('file', file);
      const res = await uploadFile(fd);
      if (res.error) setError((e) => (e ? `${e} ` : '') + res.error);
    }
    setFiles(await listFiles(site, kind));
  });
  const shown = (files ?? []).filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <dialog ref={ref} onClose={onClose} className="m-auto w-[min(96vw,56rem)] rounded-card border border-line bg-surface p-0 text-ink backdrop:bg-black/40">
      <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
        <h2 className="mr-auto font-semibold">{kind === 'image' ? 'Pilih gambar' : 'Pilih file'}</h2>
        <input type="search" placeholder="Cari nama file" value={q} onChange={(e) => setQ(e.target.value)} className={`${inlineInputCls} w-56`} aria-label="Cari file" />
        <label className={`${btn.secondary} cursor-pointer`}>
          {pending ? 'Mengunggah…' : 'Unggah'}
          <input type="file" multiple className="sr-only" accept={kind === 'image' ? 'image/*' : undefined} disabled={pending}
            onChange={(e) => { upload([...e.target.files]); e.target.value = ''; }} />
        </label>
        <button type="button" className={btn.ghost} onClick={() => ref.current?.close()}>Tutup</button>
      </div>
      {error && <p role="alert" className="px-4 pt-3 text-sm text-danger">{error}</p>}
      <div className="max-h-[60vh] overflow-y-auto p-4">
        {files === null ? <p className="text-sm text-muted">Memuat…</p> : shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted">Belum ada file. Unggah dari tombol di atas.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {shown.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => { onPick(f); if (!multiple) ref.current?.close(); }}
                  className="block w-full rounded-lg border border-line p-1 text-left hover:border-accent focus-visible:border-accent">
                  <Thumb file={f} />
                  <span className="mt-1 block truncate px-1 text-xs">{f.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}

function Thumb({ file, className = 'aspect-square' }) {
  return file.mime?.startsWith('image/')
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={file.thumb ?? file.src} alt="" className={`${className} w-full rounded-md bg-line/40 object-cover`} />
    : <span className={`${className} flex w-full items-center justify-center rounded-md bg-line/40 text-xs font-semibold uppercase text-muted`}>{file.name.split('.').pop()}</span>;
}

// Pilih satu/banyak file → <input type="hidden" name={name} value={id}> per file, urutan bisa diubah.
export function FilePicker({ name, site, kind = 'any', multiple = false, defaultFiles = [], label = 'Pilih file' }) {
  const [selected, setSelected] = useState(defaultFiles);
  const [open, setOpen] = useState(false);
  const move = (i, d) => setSelected((s) => { const n = [...s]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n; });
  return (
    <div>
      {selected.length > 0 && (
        <ul className={`mb-2 grid gap-2 ${multiple ? 'grid-cols-3 sm:grid-cols-5' : 'max-w-40'}`}>
          {selected.map((f, i) => (
            <li key={f.id} className="rounded-lg border border-line p-1">
              <input type="hidden" name={name} value={f.id} />
              <Thumb file={f} className="aspect-[4/3]" />
              <span className="mt-1 block truncate px-1 text-xs" title={f.name}>{f.name}</span>
              <span className="flex justify-between px-0.5">
                {multiple && <span>
                  <button type="button" className={tool} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Geser ${f.name} ke kiri`}>←</button>
                  <button type="button" className={tool} disabled={i === selected.length - 1} onClick={() => move(i, 1)} aria-label={`Geser ${f.name} ke kanan`}>→</button>
                </span>}
                <button type="button" className={`${tool} ml-auto`} onClick={() => setSelected((s) => s.filter((x) => x.id !== f.id))} aria-label={`Hapus ${f.name}`}>✕</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className={btn.secondary} onClick={() => setOpen(true)}>{selected.length && !multiple ? 'Ganti' : label}</button>
      {open && <FileDialog site={site} kind={kind} multiple={multiple} onClose={() => setOpen(false)}
        onPick={(f) => setSelected((s) => (multiple ? (s.some((x) => x.id === f.id) ? s : [...s, f]) : [f]))} />}
    </div>
  );
}

// Daftar pasangan label–nilai (spesifikasi produk) → JSON di input tersembunyi.
export function PairsEditor({ name, defaultValue = [], labels = ['Label', 'Nilai'] }) {
  const [rows, setRows] = useState(defaultValue.length ? defaultValue : [{ label: '', value: '' }]);
  const set = (i, k, v) => setRows((r) => r.map((row, j) => (j === i ? { ...row, [k]: v } : row)));
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <input aria-label={`${labels[0]} ${i + 1}`} placeholder={labels[0]} value={r.label} onChange={(e) => set(i, 'label', e.target.value)} className={`${inlineInputCls} w-2/5`} />
          <input aria-label={`${labels[1]} ${i + 1}`} placeholder={labels[1]} value={r.value} onChange={(e) => set(i, 'value', e.target.value)} className={inputCls} />
          <button type="button" className={btn.ghost} onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label={`Hapus baris ${i + 1}`}>✕</button>
        </div>
      ))}
      <button type="button" className={btn.ghost} onClick={() => setRows((x) => [...x, { label: '', value: '' }])}>+ Tambah baris</button>
      <input type="hidden" name={name} value={JSON.stringify(rows.filter((r) => r.label.trim() || r.value.trim()))} />
    </div>
  );
}

// Handle URL mengikuti judul sampai diubah manual.
export function TitleHandle({ defaultTitle = '', defaultHandle = '', prefix, titleLabel = 'Judul' }) {
  const toHandle = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  const [handle, setHandle] = useState(defaultHandle);
  const [touched, setTouched] = useState(!!defaultHandle);
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="title" className="block text-sm font-medium">{titleLabel}</label>
        <input id="title" name="title" required defaultValue={defaultTitle} className={`${inputCls} mt-1.5`}
          onChange={(e) => !touched && setHandle(toHandle(e.target.value))} />
      </div>
      <div>
        <label htmlFor="handle" className="block text-sm font-medium">URL</label>
        <div className="mt-1.5 flex items-center rounded-lg border border-line bg-surface focus-within:outline-2 focus-within:outline-accent">
          <span className="pl-3 text-sm text-muted">{prefix}</span>
          <input id="handle" name="handle" required value={handle} pattern="[a-z0-9]+(-[a-z0-9]+)*"
            onChange={(e) => { setTouched(true); setHandle(e.target.value.toLowerCase()); }}
            className="min-w-0 flex-1 rounded-r-lg bg-transparent px-1 py-2 text-sm outline-none" />
        </div>
      </div>
    </div>
  );
}
