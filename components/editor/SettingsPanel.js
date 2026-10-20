'use client';

// Form pengaturan section/block/theme, dibuat otomatis dari schema (tipe setting PRD §6.4).
import { useState } from 'react';
import { btn, inputCls } from '@/components/admin/ui';
import { FileDialog, RichText } from '@/components/admin/editors';

// Google Fonts terkurasi (PRD §6.4 font_picker).
const FONTS = ['Instrument Sans', 'Inter', 'Geist', 'Manrope', 'Plus Jakarta Sans', 'DM Sans', 'Work Sans', 'Outfit', 'Figtree', 'Karla', 'Nunito', 'Nunito Sans', 'Jost', 'Lexend',
  'Josefin Sans', 'Barlow', 'Barlow Condensed', 'Archivo', 'Bricolage Grotesque', 'Space Grotesk', 'IBM Plex Sans', 'IBM Plex Mono', 'JetBrains Mono',
  'Fraunces', 'Newsreader', 'Source Serif 4', 'Cormorant Garamond', 'Marcellus', 'Playfair Display', 'Lora', 'Merriweather'];
const text = (v) => (typeof v === 'object' && v ? v.id ?? Object.values(v)[0] : v);
const fieldId = (def, scope) => `set-${scope}-${def.id}`;

function Field({ def, value, onChange, site, resources, canCode, scope }) {
  const id = fieldId(def, scope);
  const lbl = text(def.label) ?? def.id;
  const info = text(def.info);
  if (def.type === 'header') return <h3 className="border-t border-line pt-4 text-sm font-semibold">{text(def.content)}</h3>;
  if (def.type === 'paragraph') return <p className="text-xs text-muted">{text(def.content)}</p>;

  let control;
  switch (def.type) {
    case 'checkbox':
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {lbl}
        </label>
      );
    case 'textarea':
      control = <textarea id={id} rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} />;
      break;
    case 'html': case 'liquid':
      control = (
        <textarea id={id} rows={6} value={value ?? ''} disabled={!canCode} onChange={(e) => onChange(e.target.value)} spellCheck={false}
          className={`${inputCls} font-mono text-xs`} />
      );
      break;
    case 'number':
      control = <input id={id} type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} className={inputCls} />;
      break;
    case 'range':
      control = (
        <div className="flex items-center gap-3">
          <input id={id} type="range" min={def.min} max={def.max} step={def.step ?? 1} value={value ?? def.min} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-[var(--accent)]" />
          <output htmlFor={id} className="w-16 text-right text-sm tabular-nums">{value}{def.unit ?? ''}</output>
        </div>
      );
      break;
    case 'select':
      control = (
        <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          {def.options?.map((o) => <option key={o.value} value={o.value}>{text(o.label)}</option>)}
        </select>
      );
      break;
    case 'radio':
      return (
        <fieldset>
          <legend className="text-sm font-medium">{lbl}</legend>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {def.options?.map((o) => (
              <label key={o.value} className="flex items-center gap-1.5 text-sm">
                <input type="radio" name={id} checked={value === o.value} onChange={() => onChange(o.value)} /> {text(o.label)}
              </label>
            ))}
          </div>
          {info && <p className="mt-1 text-xs text-muted">{info}</p>}
        </fieldset>
      );
    case 'color':
      control = (
        <div className="flex items-center gap-2">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value ?? '') ? value : '#000000'} onChange={(e) => onChange(e.target.value)} aria-label={lbl} className="h-9 w-12 cursor-pointer rounded border border-line bg-transparent" />
          <input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} />
        </div>
      );
      break;
    case 'richtext': case 'inline_richtext':
      control = <RichText defaultValue={value ?? ''} site={site} onChange={onChange} minHeight={def.type === 'inline_richtext' ? 'min-h-12' : 'min-h-28'} />;
      break;
    case 'image_picker': case 'video':
      control = <MediaField value={value} onChange={onChange} site={site} kind={def.type === 'image_picker' ? 'image' : 'any'} />;
      break;
    case 'font_picker':
      control = (
        <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls}>
          {[...new Set([value, ...FONTS].filter(Boolean))].map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      );
      break;
    case 'page': case 'product': case 'collection': case 'blog': case 'article': case 'link_list':
      control = (
        <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className={inputCls}>
          <option value="">— Pilih —</option>
          {resources[def.type]?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
      break;
    case 'product_list': case 'collection_list': {
      const list = resources[def.type === 'product_list' ? 'product' : 'collection'] ?? [];
      control = (
        <select id={id} multiple value={value ?? []} onChange={(e) => onChange([...e.target.selectedOptions].map((o) => o.value).slice(0, def.limit ?? 50))} className={`${inputCls} h-36`}>
          {list.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
      break;
    }
    case 'url':
      control = (
        <>
          <input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="/pages/... atau https://" list="fauqa-links" className={inputCls} />
          <datalist id="fauqa-links">
            {['/', '/collections/all', '/collections', '/search', ...(resources.page ?? []).map((p) => `/pages/${p.value}`), ...(resources.collection ?? []).map((c) => `/collections/${c.value}`),
              ...(resources.blog ?? []).map((b) => `/blogs/${b.value}`)].map((u) => <option key={u} value={u} />)}
          </datalist>
        </>
      );
      break;
    default: // text, video_url, color_background, color_scheme, dll.
      control = <input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={text(def.placeholder)} className={inputCls} />;
  }
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">{lbl}</label>
      <div className="mt-1.5">{control}</div>
      {(def.type === 'html' || def.type === 'liquid') && !canCode && <p className="mt-1 text-xs text-muted">Hanya owner/admin yang bisa mengubah kode.</p>}
      {info && <p className="mt-1 text-xs text-muted">{info}</p>}
    </div>
  );
}

// Nilai disimpan sebagai 'files/<folder>/<nama>' (dibaca filter image_url / file_url di theme).
function MediaField({ value, onChange, site, kind }) {
  const [open, setOpen] = useState(false);
  const name = typeof value === 'string' ? value.replace(/^files\//, '') : '';
  const external = /^(https?:)?\/\//.test(name);
  return (
    <div className="space-y-2">
      {name ? <p className="truncate rounded-md bg-line/40 px-2 py-1.5 text-xs" title={name}>{external ? 'Gambar dari URL luar' : name}</p> : <p className="text-xs text-muted">Belum dipilih.</p>}
      <div className="flex gap-2">
        <button type="button" className={btn.secondary} onClick={() => setOpen(true)}>{name ? 'Ganti' : 'Pilih'}</button>
        {name && <button type="button" className={btn.ghost} onClick={() => onChange('')}>Hapus</button>}
      </div>
      {open && <FileDialog site={site} kind={kind} onClose={() => setOpen(false)} onPick={(f) => onChange(`files/${f.folder ? `${f.folder}/` : ''}${f.name}`)} />}
    </div>
  );
}

function Fields({ defs = [], values = {}, set, scope, ...ctx }) {
  if (!defs.length) return <p className="text-sm text-muted">Bagian ini tidak punya pengaturan.</p>;
  return <div className="space-y-4">{defs.map((def, i) => <Field key={def.id ?? `x${i}`} def={def} scope={scope} value={values[def.id] ?? def.default} onChange={(v) => set(def.id, v)} {...ctx} />)}</div>;
}

export default function SettingsPanel({ file, sectionId, blockId, data, schema = {}, change, onBack, onRemoved, ...ctx }) {
  const block = blockId ? data.blocks?.[blockId] : null;
  const blockDef = block && schema.blocks?.find((b) => b.type === block.type);
  const set = (key, v) => change(file, (d) => {
    const target = blockId ? d.sections[sectionId].blocks[blockId] : d.sections[sectionId];
    target.settings = { ...target.settings, [key]: v };
    return d;
  }, { mode: 'section', sectionId, tag: `${sectionId}/${blockId ?? ''}/${key}` });
  const remove = () => {
    change(file, (d) => {
      if (blockId) {
        delete d.sections[sectionId].blocks[blockId];
        d.sections[sectionId].block_order = (d.sections[sectionId].block_order ?? []).filter((x) => x !== blockId);
      } else {
        delete d.sections[sectionId];
        d.order = (d.order ?? []).filter((x) => x !== sectionId);
      }
      return d;
    }, blockId ? { mode: 'section', sectionId } : { mode: 'page' });
    if (blockId) onBack(); else onRemoved();
  };
  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-2">
        {blockId && <button type="button" className={btn.ghost} onClick={onBack} aria-label="Kembali ke section">←</button>}
        <h2 className="font-semibold">{text(blockId ? blockDef?.name : schema.name) ?? (block?.type ?? data.type)}</h2>
      </div>
      {blockId && !block ? <p className="text-sm text-muted">Block tidak ditemukan.</p> : (
        <Fields defs={blockId ? blockDef?.settings : schema.settings} values={(blockId ? block : data).settings ?? {}} set={set} scope={`${sectionId}-${blockId ?? ''}`} {...ctx} />
      )}
      <button type="button" onClick={remove} className={`${btn.danger} mt-6 w-full`}>{blockId ? 'Hapus block' : 'Hapus section'}</button>
    </div>
  );
}

// Theme settings global (config/settings_schema.json), disimpan ke settings_data.json → current.
export function ThemeSettingsPanel({ schema, data = {}, change, ...ctx }) {
  const groups = schema.filter((g) => g.settings?.length);
  const [open, setOpen] = useState(groups[0]?.name);
  const current = typeof data.current === 'object' ? data.current : data.presets?.[data.current] ?? {};
  const presets = Object.keys(data.presets ?? {});
  const set = (key, v) => change((d) => {
    const cur = typeof d.current === 'object' ? d.current : { ...(d.presets?.[d.current] ?? {}) };
    d.current = { ...cur, [key]: v };
    return d;
  }, `theme/${key}`);
  return (
    <div className="p-4">
      <h2 className="mb-4 font-semibold">Theme settings</h2>
      {presets.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-medium">Preset gaya</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {presets.map((p) => (
              <button key={p} type="button" className={btn.secondary} onClick={() => change((d) => { d.current = { ...d.presets[p], ...(typeof d.current === 'object' && d.current.sections ? { sections: d.current.sections } : {}) }; return d; })}>{p}</button>
            ))}
          </div>
        </div>
      )}
      <div className="divide-y divide-line border-y border-line">
        {groups.map((g) => (
          <section key={g.name}>
            <button type="button" aria-expanded={open === g.name} onClick={() => setOpen(open === g.name ? null : g.name)}
              className="flex w-full items-center justify-between py-3 text-left text-sm font-medium">{text(g.name)}<span aria-hidden="true">{open === g.name ? '−' : '+'}</span></button>
            {open === g.name && <div className="pb-4"><Fields defs={g.settings} values={current} set={set} scope={`theme-${g.name}`} {...ctx} /></div>}
          </section>
        ))}
      </div>
    </div>
  );
}
