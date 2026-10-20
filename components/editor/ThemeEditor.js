'use client';

// Theme editor visual (PRD §4.3): daftar section/block (kiri), preview iframe (tengah), pengaturan (kanan).
// Preview: halaman penuh lewat POST form ke /__fauqa/preview di domain situs; perubahan setting satu section
// dirender ulang lewat bridge (postMessage) → /api/render-section. Tanpa cookie, origin dicek dua arah.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { btn } from '@/components/admin/ui';
import { saveThemeChanges } from '@/app/editor/actions';
import SectionList from './SectionList';
import SettingsPanel, { ThemeSettingsPanel } from './SettingsPanel';

const DEVICES = [['desktop', 'Desktop', '100%'], ['tablet', 'Tablet', '820px'], ['mobile', 'Mobile', '390px']];
const HISTORY = 60;

// Kunci DOM section, sama dengan engine: template--<tipe>__<id> atau <group>__<id>.
const domKey = (file, templateType, sectionId) =>
  file.startsWith('templates/') ? `template--${templateType}__${sectionId}` : `${file.slice(9, -5)}__${sectionId}`;

export default function ThemeEditor({ site, theme, initialFiles, initialUpdatedAt, schemas, settingsSchema, templates: initialTemplates, resources, token }) {
  const [files, setFiles] = useState(initialFiles);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [dirty, setDirty] = useState(() => new Set());
  const [templates, setTemplates] = useState(initialTemplates);
  const [templateKey, setTemplateKey] = useState(initialTemplates[0]?.key);
  const [selected, setSelected] = useState(null); // { file, sectionId, blockId? } | { theme: true }
  const [device, setDevice] = useState('desktop');
  const [status, setStatus] = useState(null);     // { type: 'ok'|'error', text, conflict? }
  const [saving, setSaving] = useState(false);
  const history = useRef({ past: [], future: [], lastTag: null, lastAt: 0 });
  const frame = useRef(null);
  const form = useRef(null);
  const ready = useRef(false);
  const timers = useRef({});

  const template = templates.find((t) => t.key === templateKey);
  const origin = useMemo(() => new URL(site.url).origin, [site.url]);
  const canCode = ['owner', 'admin'].includes(site.role);
  const groupKeys = Object.keys(files).filter((k) => /^sections\/[a-z0-9_-]+\.json$/.test(k));
  const headerGroups = groupKeys.filter((k) => files[k].type !== 'footer');
  const footerGroups = groupKeys.filter((k) => files[k].type === 'footer');
  const lists = [...headerGroups, templateKey, ...footerGroups].filter(Boolean);
  const overrides = useCallback((f) => Object.fromEntries([...dirty, templateKey, ...groupKeys, 'config/settings_data.json']
    .filter((k) => f[k]).map((k) => [k, f[k]])), [dirty, templateKey, groupKeys]);

  // ---------- preview
  const reload = useCallback((f = files) => {
    const el = form.current;
    if (!el || !template?.path) return;
    ready.current = false;
    el.elements.path.value = template.path;
    el.elements.view.value = template.suffix ?? '';
    el.elements.overrides.value = JSON.stringify(overrides(f));
    el.submit();
  }, [files, template, overrides]);
  const send = useCallback((msg) => frame.current?.contentWindow?.postMessage({ __fauqa: true, ...msg }, origin), [origin]);

  useEffect(() => { reload(); }, [templateKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onMessage = (e) => {
      if (e.origin !== origin || !e.data?.__fauqa) return;
      if (e.data.type === 'ready') {
        ready.current = true;
        if (selected?.sectionId) send({ type: 'select', key: domKey(selected.file, template?.type, selected.sectionId), block: selected.blockId ?? null });
      }
      if (e.data.type === 'select') {
        const key = e.data.key;
        const file = lists.find((f) => key.startsWith(f.startsWith('templates/') ? `template--${template?.type}__` : `${f.slice(9, -5)}__`));
        if (file) setSelected({ file, sectionId: key.slice(key.indexOf('__') + 2), blockId: e.data.block ?? null });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [origin, selected, template, lists, send]);

  useEffect(() => {
    if (selected?.sectionId && ready.current) send({ type: 'select', key: domKey(selected.file, template?.type, selected.sectionId), block: selected.blockId ?? null });
  }, [selected, template, send]);

  // Peringatan meninggalkan halaman dengan perubahan belum disimpan.
  useEffect(() => {
    const warn = (e) => { if (dirty.size) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ---------- perubahan + riwayat (undo/redo)
  // mode: 'section' → render ulang satu section; 'page' → muat ulang preview penuh.
  const change = (key, updater, { mode = 'page', sectionId, tag } = {}) => {
    const next = { ...files, [key]: updater(structuredClone(files[key])) };
    const h = history.current;
    const now = Date.now();
    // Ketikan beruntun pada field yang sama digabung jadi satu langkah undo.
    if (!(tag && tag === h.lastTag && now - h.lastAt < 1000)) {
      h.past = [...h.past.slice(-HISTORY + 1), { files, dirty: new Set(dirty) }];
      h.future = [];
    }
    h.lastTag = tag;
    h.lastAt = now;
    setFiles(next);
    setDirty((d) => new Set(d).add(key));
    const t = mode + (sectionId ?? '');
    clearTimeout(timers.current[t]);
    timers.current[t] = setTimeout(() => {
      if (mode === 'section' && ready.current) {
        send({ type: 'render', key: domKey(key, template?.type, sectionId), file: key.startsWith('templates/') ? 'template' : key, sectionId, overrides: overrides(next) });
      } else reload(next);
    }, mode === 'section' ? 250 : 400);
  };

  const travel = (dir) => {
    const h = history.current;
    const from = dir === 'undo' ? h.past : h.future;
    if (!from.length) return;
    const step = from.at(-1);
    const current = { files, dirty: new Set(dirty) };
    if (dir === 'undo') { h.past = h.past.slice(0, -1); h.future = [...h.future, current]; } else { h.future = h.future.slice(0, -1); h.past = [...h.past, current]; }
    h.lastTag = null;
    setFiles(step.files);
    setDirty(step.dirty);
    reload(step.files);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.target.closest?.('.ProseMirror')) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); travel('undo'); }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); travel('redo'); }
      if (e.key === 's') { e.preventDefault(); save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- simpan
  async function save() {
    if (!dirty.size || saving) return;
    setSaving(true);
    setStatus(null);
    const changes = [...dirty].map((key) => ({ key, content: files[key], expected: updatedAt[key] ?? null }));
    const res = await saveThemeChanges({ site: site.slug, themeId: theme.id, changes }).catch((e) => ({ error: e.message }));
    setSaving(false);
    if (res.error) return setStatus({ type: 'error', text: res.error, conflict: res.conflict });
    setUpdatedAt((u) => ({ ...u, ...res.updatedAt }));
    setDirty(new Set());
    setStatus({ type: 'ok', text: theme.live ? 'Tersimpan dan langsung tayang.' : 'Tersimpan.' });
  }

  // Buat template alternatif (page.<nama>.json) dari template dasar tipe yang sedang dibuka.
  function createTemplate() {
    const type = template?.type ?? 'page';
    const name = window.prompt(`Nama template ${type} baru (huruf kecil, angka, tanda hubung). Contoh: tentang`);
    if (!name) return;
    const suffix = name.toLowerCase().trim().replace(/[^a-z0-9_-]+/g, '-');
    const key = `templates/${type}.${suffix}.json`;
    if (!suffix || files[key]) return window.alert('Nama tidak valid atau sudah dipakai.');
    const base = files[`templates/${type}.json`] ?? { sections: {}, order: [] };
    setFiles((f) => ({ ...f, [key]: structuredClone(base) }));
    setDirty((d) => new Set(d).add(key));
    setTemplates((t) => [...t, { key, name: `${type}.${suffix}`, type, suffix, path: template?.path ?? null }]);
    setTemplateKey(key);
  }

  const sectionData = selected?.sectionId ? files[selected.file]?.sections?.[selected.sectionId] : null;

  return (
    <div className="flex h-dvh flex-col bg-bg text-ink">
      {/* Bar atas */}
      <header className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2">
        <Link href={`/s/${site.slug}/tema`} className={btn.ghost}>← Keluar</Link>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{theme.name} {theme.live && <span className="ml-1 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success">Live</span>}</p>
          <p className="truncate text-xs text-muted">{site.name}</p>
        </div>
        <label className="ml-4 flex items-center gap-2 text-sm">
          <span className="text-muted">Template</span>
          <select value={templateKey} onChange={(e) => (e.target.value === '__new' ? createTemplate() : setTemplateKey(e.target.value))}
            className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm">
            {templates.map((t) => <option key={t.key} value={t.key} disabled={!t.path}>{t.name}{!t.path ? ' (belum ada konten)' : ''}</option>)}
            <option value="__new">+ Buat template…</option>
          </select>
        </label>
        <div className="mx-auto flex rounded-lg border border-line p-0.5" role="group" aria-label="Ukuran layar">
          {DEVICES.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={device === id} onClick={() => setDevice(id)}
              className="rounded-md px-3 py-1 text-sm text-muted aria-pressed:bg-accent-tint aria-pressed:text-accent">{label}</button>
          ))}
        </div>
        <button type="button" className={btn.ghost} onClick={() => travel('undo')} disabled={!history.current.past.length} title="Urungkan (Ctrl/⌘+Z)">Urungkan</button>
        <button type="button" className={btn.ghost} onClick={() => travel('redo')} disabled={!history.current.future.length} title="Ulangi (Ctrl/⌘+Shift+Z)">Ulangi</button>
        <button type="button" className={btn.primary} onClick={save} disabled={!dirty.size || saving} title="Simpan (Ctrl/⌘+S)">
          {saving ? 'Menyimpan…' : dirty.size ? 'Simpan' : 'Tersimpan'}
        </button>
      </header>
      {status && (
        <div role={status.type === 'error' ? 'alert' : 'status'} className={`flex items-center gap-3 px-4 py-2 text-sm ${status.type === 'error' ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}>
          <span className="flex-1">{status.text}</span>
          {status.conflict && <button type="button" className={btn.secondary} onClick={() => window.location.reload()}>Muat ulang (perubahan Anda hilang)</button>}
          <button type="button" className={btn.ghost} onClick={() => setStatus(null)} aria-label="Tutup">✕</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Kiri: section & block */}
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-line bg-surface" aria-label="Section">
          {lists.map((key) => (
            <SectionList key={key} fileKey={key} data={files[key]} schemas={schemas}
              label={key.startsWith('templates/') ? `Template · ${template?.name}` : files[key].name ?? key.slice(9, -5)}
              context={key.startsWith('templates/') ? { template: template?.type } : { group: files[key].type }}
              selected={selected} onSelect={setSelected} change={change} />
          ))}
          <button type="button" onClick={() => setSelected({ theme: true })} aria-pressed={!!selected?.theme}
            className="m-3 w-[calc(100%-1.5rem)] rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-line/40 aria-pressed:border-accent aria-pressed:bg-accent-tint aria-pressed:text-accent">
            ⚙ Theme settings
          </button>
        </aside>

        {/* Tengah: preview */}
        <main className="flex min-w-0 flex-1 justify-center overflow-auto bg-line/40 p-4">
          {template?.path ? (
            <iframe ref={frame} name="fauqa-preview" title="Preview situs" style={{ width: DEVICES.find((d) => d[0] === device)[2] }}
              className="h-full max-w-full rounded-lg border border-line bg-white shadow-sm transition-[width]" />
          ) : <p className="self-center text-sm text-muted">Belum ada konten untuk template ini. Buat dulu di menu Konten.</p>}
          <form ref={form} method="post" action={`${site.url}/__fauqa/preview`} target="fauqa-preview" hidden>
            <input type="hidden" name="token" value={token} readOnly />
            <input type="hidden" name="path" />
            <input type="hidden" name="view" />
            <input type="hidden" name="overrides" />
          </form>
        </main>

        {/* Kanan: pengaturan */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-line bg-surface" aria-label="Pengaturan">
          {selected?.theme ? (
            <ThemeSettingsPanel schema={settingsSchema} data={files['config/settings_data.json']} site={site.slug} resources={resources} canCode={canCode}
              change={(updater, tag) => change('config/settings_data.json', updater, { mode: 'page', tag })} />
          ) : sectionData ? (
            <SettingsPanel key={`${selected.file}:${selected.sectionId}:${selected.blockId ?? ''}`} file={selected.file} sectionId={selected.sectionId} blockId={selected.blockId}
              data={sectionData} schema={schemas[sectionData.type]} site={site.slug} resources={resources} canCode={canCode} change={change}
              onBack={() => setSelected({ file: selected.file, sectionId: selected.sectionId })}
              onRemoved={() => setSelected(null)} />
          ) : (
            <div className="p-5 text-sm text-muted">
              <p className="font-medium text-ink">Pilih section</p>
              <p className="mt-1">Klik section di daftar kiri atau langsung di preview untuk mengubah isinya.</p>
            </div>
          )}
        </aside>
      </div>

      {/* Editor butuh layar lebar (PRD §4.3). */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg p-6 text-center lg:hidden">
        <div>
          <p className="font-semibold">Editor tampilan butuh layar minimal 1024px</p>
          <p className="mt-1 text-sm text-muted">Buka dari laptop/desktop. Konten tetap bisa diubah dari menu Konten.</p>
          <Link href={`/s/${site.slug}`} className={`${btn.secondary} mt-4`}>Kembali ke dashboard</Link>
        </div>
      </div>
    </div>
  );
}
