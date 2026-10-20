// Validasi nilai setting dari theme editor terhadap schema (PRD §6.4) sebelum disimpan. Murni (tanpa DB).
// - richtext/inline_richtext disanitasi (allowlist), html/liquid hanya boleh diubah owner/admin (PRD §8.2)
// - select/radio harus salah satu opsi, range/number dijepit ke min/max, checkbox boolean, teks dipotong.

const MAX_TEXT = 5000;

function cleanValue(def, value, { cleanHtml }) {
  switch (def.type) {
    case 'checkbox': return value === true || value === 'true';
    case 'number': {
      const n = Number(value);
      return value === '' || value == null || Number.isNaN(n) ? (def.default ?? null) : n;
    }
    case 'range': {
      const n = Number(value);
      if (Number.isNaN(n)) return def.default ?? def.min;
      return Math.min(def.max, Math.max(def.min, n));
    }
    case 'select': case 'radio':
      return (def.options ?? []).some((o) => o.value === value) ? value : def.default ?? def.options?.[0]?.value ?? null;
    case 'richtext': case 'inline_richtext':
      return cleanHtml(String(value ?? '')).slice(0, 50000);
    case 'product_list': case 'collection_list':
      return Array.isArray(value) ? value.map(String).filter((v) => /^[a-z0-9-]+$/.test(v)).slice(0, def.limit ?? 50) : [];
    case 'color':
      return /^#[0-9a-f]{3,8}$/i.test(value ?? '') || value === '' ? value : def.default ?? '';
    case 'url':
      return value && !/^(\/|https?:\/\/|mailto:|tel:|#)/i.test(String(value)) ? '' : String(value ?? '').slice(0, 1000);
    default:
      return value == null ? value : String(value).slice(0, def.type === 'html' || def.type === 'liquid' ? 50000 : MAX_TEXT);
  }
}

function cleanSettings(defs = [], values = {}, old = {}, opts, where) {
  const out = {};
  for (const def of defs) {
    if (!def.id || !(def.id in values)) continue;
    if ((def.type === 'html' || def.type === 'liquid') && !opts.canCode && values[def.id] !== old?.[def.id]) {
      throw new Error(`Setting "${def.label ?? def.id}" (${def.type}) di ${where} hanya bisa diubah owner/admin.`);
    }
    out[def.id] = cleanValue(def, values[def.id], opts);
  }
  return out;
}

const SECTION_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Template JSON / section group: { sections, order } — setiap section & block dicek terhadap schema-nya. */
export function cleanSectionList(data, old, schemas, opts) {
  if (!data || typeof data !== 'object' || typeof data.sections !== 'object') throw new Error('Format template tidak valid.');
  const order = (Array.isArray(data.order) ? data.order : Object.keys(data.sections)).filter((id) => data.sections[id]).slice(0, 25);
  const sections = {};
  for (const id of order) {
    const s = data.sections[id];
    const schema = schemas[s.type];
    if (!SECTION_ID.test(id) || !schema) throw new Error(`Section "${id}" bertipe "${s.type}" tidak dikenal theme ini.`);
    const prev = old?.sections?.[id]?.type === s.type ? old.sections[id] : {};
    const blockDefs = Object.fromEntries((schema.blocks ?? []).map((b) => [b.type, b]));
    const blockOrder = (Array.isArray(s.block_order) ? s.block_order : Object.keys(s.blocks ?? {})).filter((b) => s.blocks?.[b]).slice(0, schema.max_blocks ?? 50);
    const blocks = {};
    for (const bid of blockOrder) {
      const b = s.blocks[bid];
      if (!SECTION_ID.test(bid) || !blockDefs[b.type]) throw new Error(`Block "${b.type}" tidak dikenal di section ${schema.name ?? s.type}.`);
      blocks[bid] = {
        type: b.type,
        ...(b.disabled ? { disabled: true } : {}),
        settings: cleanSettings(blockDefs[b.type].settings, b.settings ?? {}, prev.blocks?.[bid]?.settings, opts, `block ${blockDefs[b.type].name ?? b.type}`),
      };
    }
    sections[id] = {
      type: s.type,
      ...(s.disabled ? { disabled: true } : {}),
      settings: cleanSettings(schema.settings, s.settings ?? {}, prev.settings, opts, `section ${schema.name ?? s.type}`),
      ...(blockOrder.length ? { blocks, block_order: blockOrder } : {}),
    };
  }
  const extra = Object.fromEntries(['name', 'type', 'layout'].filter((k) => k in data).map((k) => [k, data[k]]));
  return { ...extra, sections, order };
}

/** config/settings_data.json: nilai `current` dicek terhadap settings_schema.json; presets dibiarkan. */
export function cleanSettingsData(data, old, settingsSchema, opts) {
  const defs = settingsSchema.flatMap((g) => g.settings ?? []);
  const oldCurrent = typeof old?.current === 'object' ? old.current : old?.presets?.[old?.current] ?? {};
  const current = typeof data?.current === 'object' ? data.current : data?.presets?.[data?.current] ?? {};
  const cleaned = cleanSettings(defs, current, oldCurrent, opts, 'Theme settings');
  return { ...old, current: { ...(typeof current.sections === 'object' ? { sections: current.sections } : {}), ...cleaned } };
}
