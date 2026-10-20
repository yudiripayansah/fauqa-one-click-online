'use client';

// Daftar section (template / section group) + block section terpilih, dengan drag-and-drop (dnd-kit, bisa keyboard).
import { useState } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export const newId = (type) => `${type}-${Math.random().toString(36).slice(2, 8)}`;
const MAX_SECTIONS = 25;

const defaults = (defs = []) => Object.fromEntries(defs.filter((d) => d.id && d.default !== undefined).map((d) => [d.id, d.default]));
const label = (v) => (typeof v === 'object' && v ? v.id ?? Object.values(v)[0] : v);
const iconBtn = 'rounded p-1 text-muted hover:bg-line/60 hover:text-ink disabled:opacity-30';

// Section boleh dipakai di template/section group ini? (enabled_on / disabled_on, PRD §4.3)
function allowed(schema, { template, group }) {
  const en = schema.enabled_on;
  const dis = schema.disabled_on;
  if (template) {
    if (en && !en.templates?.some((t) => t === '*' || t === template)) return false;
    if (dis?.templates?.some((t) => t === '*' || t === template)) return false;
  } else {
    if (!en?.groups?.some((g) => g === '*' || g === group) && en) return false;
    if (!en && !schema.presets) return false;
    if (dis?.groups?.some((g) => g === '*' || g === group)) return false;
  }
  return true;
}

function Item({ id, children, selected, hidden, onSelect, actions, level = 0 }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, paddingLeft: level ? '1.25rem' : undefined }}
      className={`group relative ${isDragging ? 'z-10 opacity-80' : ''}`}>
      <div className={`flex items-center gap-1 rounded-md pr-1 text-sm ${selected ? 'bg-accent-tint text-accent' : 'hover:bg-line/40'} ${hidden ? 'opacity-50' : ''}`}>
        <button type="button" className="cursor-grab px-1 py-1.5 text-muted active:cursor-grabbing" aria-label="Geser untuk mengubah urutan" {...attributes} {...listeners}>⠿</button>
        <button type="button" onClick={onSelect} aria-current={selected ? 'true' : undefined} className="min-w-0 flex-1 truncate py-1.5 text-left">{children}</button>
        <span className="hidden gap-0.5 group-focus-within:flex group-hover:flex">{actions}</span>
      </div>
    </li>
  );
}

function Picker({ label: text, options, onPick, disabled }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full rounded-md px-2 py-1.5 text-left text-sm text-accent hover:bg-line/40 disabled:text-muted">+ {text}</button>
      {open && (
        <ul className="absolute inset-x-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-lg">
          {options.length === 0 && <li className="px-3 py-2 text-sm text-muted">Tidak ada pilihan.</li>}
          {options.map((o) => (
            <li key={o.key}><button type="button" className="w-full rounded-md px-3 py-1.5 text-left text-sm hover:bg-line/50" onClick={() => { setOpen(false); onPick(o); }}>{o.label}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SectionList({ fileKey, data, schemas, label: title, context, selected, onSelect, change }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const order = data.order ?? Object.keys(data.sections ?? {});
  const isTemplate = fileKey.startsWith('templates/');
  const edit = (fn, opts) => change(fileKey, (d) => { d.order ??= Object.keys(d.sections); fn(d); return d; }, opts);

  const presets = Object.entries(schemas).filter(([, s]) => s.presets?.length && allowed(s, context))
    .flatMap(([type, s]) => s.presets.map((p, i) => ({ key: `${type}:${i}`, type, preset: p, label: label(p.name) ?? label(s.name) ?? type,
      full: s.limit && order.filter((id) => data.sections[id]?.type === type).length >= s.limit })))
    .filter((o) => !o.full);

  function addSection({ type, preset }) {
    const schema = schemas[type];
    const id = newId(type);
    const blocks = {};
    const blockOrder = [];
    for (const b of preset.blocks ?? []) {
      const bid = newId(b.type);
      blocks[bid] = { type: b.type, settings: { ...defaults(schema.blocks?.find((x) => x.type === b.type)?.settings), ...b.settings } };
      blockOrder.push(bid);
    }
    edit((d) => {
      d.sections[id] = { type, settings: { ...defaults(schema.settings), ...preset.settings }, ...(blockOrder.length ? { blocks, block_order: blockOrder } : {}) };
      // Section baru masuk setelah section terpilih, atau di akhir.
      const at = selected?.file === fileKey ? d.order.indexOf(selected.sectionId) + 1 : d.order.length;
      d.order.splice(at || d.order.length, 0, id);
    });
    onSelect({ file: fileKey, sectionId: id });
  }

  const onDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return;
    edit((d) => { d.order = arrayMove(d.order, d.order.indexOf(active.id), d.order.indexOf(over.id)); });
  };

  return (
    <section className="border-b border-line p-3">
      <h2 className="px-1 pb-2 text-xs font-medium text-muted">{title}</h2>
      <DndContext id={`dnd-${fileKey}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ul className="space-y-0.5">
            {order.map((id) => {
              const s = data.sections[id];
              if (!s) return null;
              const schema = schemas[s.type] ?? {};
              const isSel = selected?.file === fileKey && selected.sectionId === id;
              return [
                <Item key={id} id={id} selected={isSel && !selected.blockId} hidden={s.disabled}
                  onSelect={() => onSelect({ file: fileKey, sectionId: id })}
                  actions={<>
                    <button type="button" className={iconBtn} title={s.disabled ? 'Tampilkan' : 'Sembunyikan'} aria-label={s.disabled ? `Tampilkan ${label(schema.name)}` : `Sembunyikan ${label(schema.name)}`}
                      onClick={() => edit((d) => { if (d.sections[id].disabled) delete d.sections[id].disabled; else d.sections[id].disabled = true; })}>{s.disabled ? '◌' : '◉'}</button>
                    <button type="button" className={iconBtn} title="Duplikat" aria-label={`Duplikat ${label(schema.name)}`} disabled={order.length >= MAX_SECTIONS || (schema.limit && order.filter((x) => data.sections[x]?.type === s.type).length >= schema.limit)}
                      onClick={() => { const nid = newId(s.type); edit((d) => { d.sections[nid] = structuredClone(d.sections[id]); d.order.splice(d.order.indexOf(id) + 1, 0, nid); }); onSelect({ file: fileKey, sectionId: nid }); }}>⧉</button>
                    <button type="button" className={iconBtn} title="Hapus" aria-label={`Hapus ${label(schema.name)}`}
                      onClick={() => { edit((d) => { delete d.sections[id]; d.order = d.order.filter((x) => x !== id); }); if (isSel) onSelect(null); }}>✕</button>
                  </>}>
                  {label(schema.name) ?? s.type}
                  {s.settings?.heading && <span className="ml-1 text-xs text-muted">· {String(s.settings.heading).slice(0, 30)}</span>}
                </Item>,
                isSel && <Blocks key={`${id}-blocks`} fileKey={fileKey} sectionId={id} section={s} schema={schema} selected={selected} onSelect={onSelect} change={change} />,
              ];
            })}
          </ul>
        </SortableContext>
      </DndContext>
      {(isTemplate || presets.length > 0) && (
        <div className="mt-1"><Picker label="Tambah section" options={presets} onPick={addSection} disabled={order.length >= MAX_SECTIONS} /></div>
      )}
    </section>
  );
}

function Blocks({ fileKey, sectionId, section, schema, selected, onSelect, change }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const defs = schema.blocks ?? [];
  if (!defs.length) return null;
  const order = section.block_order ?? Object.keys(section.blocks ?? {});
  const edit = (fn) => change(fileKey, (d) => { const s = d.sections[sectionId]; s.blocks ??= {}; s.block_order ??= Object.keys(s.blocks); fn(s); return d; }, { mode: 'section', sectionId });
  const full = order.length >= (schema.max_blocks ?? 50);
  const options = defs.filter((b) => !b.limit || order.filter((id) => section.blocks[id]?.type === b.type).length < b.limit)
    .map((b) => ({ key: b.type, type: b.type, label: label(b.name) ?? b.type }));
  return (
    <li className="pl-5">
      <DndContext id={`dnd-${fileKey}-${sectionId}`} sensors={sensors} collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => over && active.id !== over.id && edit((s) => { s.block_order = arrayMove(s.block_order, s.block_order.indexOf(active.id), s.block_order.indexOf(over.id)); })}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <ul className="space-y-0.5 border-l border-line pl-1">
            {order.map((bid) => {
              const b = section.blocks[bid];
              if (!b) return null;
              const def = defs.find((d) => d.type === b.type) ?? {};
              const text = b.settings?.label ?? b.settings?.title ?? b.settings?.heading;
              return (
                <Item key={bid} id={bid} selected={selected.blockId === bid} hidden={b.disabled}
                  onSelect={() => onSelect({ file: fileKey, sectionId, blockId: bid })}
                  actions={<>
                    <button type="button" className={iconBtn} aria-label={b.disabled ? 'Tampilkan block' : 'Sembunyikan block'}
                      onClick={() => edit((s) => { if (s.blocks[bid].disabled) delete s.blocks[bid].disabled; else s.blocks[bid].disabled = true; })}>{b.disabled ? '◌' : '◉'}</button>
                    <button type="button" className={iconBtn} aria-label="Duplikat block" disabled={full}
                      onClick={() => { const nid = newId(b.type); edit((s) => { s.blocks[nid] = structuredClone(s.blocks[bid]); s.block_order.splice(s.block_order.indexOf(bid) + 1, 0, nid); }); }}>⧉</button>
                    <button type="button" className={iconBtn} aria-label="Hapus block"
                      onClick={() => { edit((s) => { delete s.blocks[bid]; s.block_order = s.block_order.filter((x) => x !== bid); }); if (selected.blockId === bid) onSelect({ file: fileKey, sectionId }); }}>✕</button>
                  </>}>
                  {label(def.name) ?? b.type}{text && <span className="ml-1 text-xs text-muted">· {String(text).slice(0, 24)}</span>}
                </Item>
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>
      <Picker label="Tambah block" options={options} disabled={full}
        onPick={({ type }) => {
          const nid = newId(type);
          edit((s) => { s.blocks[nid] = { type, settings: defaults(defs.find((d) => d.type === type)?.settings) }; s.block_order.push(nid); });
          onSelect({ file: fileKey, sectionId, blockId: nid });
        }} />
    </li>
  );
}
