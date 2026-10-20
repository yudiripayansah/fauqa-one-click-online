'use client';

import { useState } from 'react';
import { btn, inputCls } from '@/components/admin/ui';

// path = indeks bertingkat, mis. [0, 2]
const listAt = (tree, path) => path.reduce((list, i) => list[i].items, tree);

function Row({ item, path, items, update, links, groups }) {
  const depth = path.length;
  const parent = path.slice(0, -1);
  const idx = path.at(-1);
  const set = (k, v) => update((t) => { listAt(t, parent)[idx][k] = v; });
  const siblings = listAt(items, parent);
  return (
    <li className="space-y-2">
      <div className="grid items-center gap-2 rounded-lg border border-line bg-surface p-2 md:grid-cols-[1fr_11rem_1.3fr_auto]">
        <input value={item.title} onChange={(e) => set('title', e.target.value)} placeholder="Teks" aria-label="Teks item menu" className={inputCls} />
        <select value={links.some((l) => l.url === item.url) ? item.url : ''} onChange={(e) => {
          const l = links.find((x) => x.url === e.target.value);
          if (l) update((t) => { const it = listAt(t, parent)[idx]; it.url = l.url; if (!it.title) it.title = l.title; });
        }} aria-label="Tujuan" className={inputCls}>
          <option value="">Link lain…</option>
          {groups.map((g) => <optgroup key={g} label={g}>{links.filter((l) => l.group === g).map((l) => <option key={l.url} value={l.url}>{l.title}</option>)}</optgroup>)}
        </select>
        <input value={item.url} onChange={(e) => set('url', e.target.value)} placeholder="/pages/... atau https://" aria-label="URL" className={inputCls} />
        <span className="flex">
          <button type="button" className={btn.ghost} disabled={idx === 0} aria-label="Naik" onClick={() => update((t) => { const l = listAt(t, parent); [l[idx - 1], l[idx]] = [l[idx], l[idx - 1]]; })}>↑</button>
          <button type="button" className={btn.ghost} disabled={idx === siblings.length - 1} aria-label="Turun" onClick={() => update((t) => { const l = listAt(t, parent); [l[idx + 1], l[idx]] = [l[idx], l[idx + 1]]; })}>↓</button>
          {depth < 3 && <button type="button" className={btn.ghost} onClick={() => update((t) => { listAt(t, parent)[idx].items.push({ title: '', url: '', items: [] }); })}>+ Sub</button>}
          <button type="button" className={btn.ghost} aria-label="Hapus" onClick={() => update((t) => { listAt(t, parent).splice(idx, 1); })}>✕</button>
        </span>
      </div>
      {item.items?.length > 0 && (
        <ul className="ml-6 space-y-2 border-l border-line pl-3">
          {item.items.map((c, i) => <Row key={i} item={c} path={[...path, i]} items={items} update={update} links={links} groups={groups} />)}
        </ul>
      )}
    </li>
  );
}

// Editor pohon menu (maks. 3 level). links = [{ group, title, url }] untuk pilihan cepat.
export default function MenuEditor({ defaultItems, links }) {
  const [items, setItems] = useState(() => defaultItems.map(function norm(it) { return { ...it, items: (it.items ?? []).map(norm) }; }));
  const update = (fn) => setItems((prev) => { const next = structuredClone(prev); fn(next); return next; });
  const groups = [...new Set(links.map((l) => l.group))];
  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-sm text-muted">Menu masih kosong.</p>}
      <ul className="space-y-2">{items.map((it, i) => <Row key={i} item={it} path={[i]} items={items} update={update} links={links} groups={groups} />)}</ul>
      <button type="button" className={btn.secondary} onClick={() => setItems((x) => [...x, { title: '', url: '', items: [] }])}>+ Tambah item</button>
      <input type="hidden" name="items" value={JSON.stringify(items)} />
    </div>
  );
}
