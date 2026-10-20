// Validasi file theme (PRD §6.7): struktur folder & ekstensi, sintaks Liquid, JSON, schema section, file wajib.
// Murni (tanpa DB). Dipakai editor kode (per file) dan upload ZIP (seluruh theme).
import { createThemeEngine, parseSchema } from './engine.js';

export const REQUIRED = ['layout/theme.liquid', 'templates/index.json', 'templates/page.json', 'config/settings_schema.json'];
export const MAX_FILES = 1000;

// Folder → ekstensi yang diizinkan. Nama file: huruf/angka/._- saja (cegah path traversal).
const RULES = {
  layout: /^[a-z0-9_-]+\.liquid$/,
  templates: /^[a-z0-9_-]+(\.[a-z0-9_-]+)?\.json$/,
  sections: /^[a-z0-9_-]+\.(liquid|json)$/,
  snippets: /^[a-z0-9_-]+\.liquid$/,
  assets: /^[A-Za-z0-9_.-]+\.(css|js|json|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf)$/,
  config: /^(settings_schema|settings_data)\.json$/,
  locales: /^[a-z]{2}(-[A-Z]{2})?(\.default)?(\.schema)?\.json$/,
};
export const TEXT_EXT = /\.(liquid|json|css|js|svg)$/;
const SETTING_TYPES = new Set(['text', 'textarea', 'number', 'range', 'checkbox', 'select', 'radio', 'color', 'color_background', 'richtext', 'inline_richtext',
  'html', 'liquid', 'image_picker', 'video', 'video_url', 'url', 'page', 'product', 'product_list', 'collection', 'collection_list', 'blog', 'article',
  'link_list', 'font_picker', 'color_scheme', 'header', 'paragraph']);

export function checkKey(key) {
  const m = /^([a-z]+)\/([^/]+)$/.exec(key ?? '');
  if (!m || !RULES[m[1]]) return 'Folder tidak dikenal. Gunakan layout, templates, sections, snippets, assets, config, atau locales.';
  if (!RULES[m[1]].test(m[2])) return `Nama atau ekstensi file tidak diizinkan di folder ${m[1]}/.`;
  return null;
}

// Baris dari posisi karakter (untuk error JSON).
const lineAt = (src, pos) => (pos == null ? null : src.slice(0, pos).split('\n').length);
function jsonError(src, e) {
  const pos = Number(/position (\d+)/.exec(e.message)?.[1]);
  const line = /line (\d+)/.exec(e.message)?.[1];
  return { line: line ? Number(line) : Number.isNaN(pos) ? null : lineAt(src, pos), message: `JSON tidak valid: ${e.message.replace(/^JSON\.parse: /, '')}` };
}

function checkSettings(list, where, out) {
  if (list == null) return;
  if (!Array.isArray(list)) return out.push({ message: `${where}: "settings" harus array.` });
  const ids = new Set();
  for (const s of list) {
    if (!s || typeof s !== 'object' || !SETTING_TYPES.has(s.type)) { out.push({ message: `${where}: tipe setting "${s?.type}" tidak dikenal.` }); continue; }
    if (s.type === 'header' || s.type === 'paragraph') continue;
    if (!s.id || !/^[a-z0-9_]+$/.test(s.id)) out.push({ message: `${where}: setting ${s.type} wajib punya id (huruf kecil, angka, _).` });
    else if (ids.has(s.id)) out.push({ message: `${where}: id setting "${s.id}" dipakai dua kali.` });
    ids.add(s.id);
    if ((s.type === 'select' || s.type === 'radio') && !s.options?.length) out.push({ message: `${where}: setting "${s.id}" (${s.type}) wajib punya options.` });
    if (s.type === 'range' && [s.min, s.max, s.step].some((v) => typeof v !== 'number')) out.push({ message: `${where}: setting "${s.id}" (range) wajib punya min, max, step.` });
  }
}

let parser;
/**
 * Validasi satu file. content: string (file teks) atau null (biner, hanya nama yang dicek).
 * @returns {{ errors: {line?: number, message: string}[], warnings: {line?: number, message: string}[] }}
 */
export function validateFile(key, content) {
  const errors = [];
  const warnings = [];
  const keyErr = checkKey(key);
  if (keyErr) return { errors: [{ message: keyErr }], warnings };
  if (content == null) return { errors, warnings };
  if (content.length > 512 * 1024) errors.push({ message: 'File teks maksimal 512 KB.' });

  if (key.endsWith('.json')) {
    let data;
    try { data = JSON.parse(content); } catch (e) { errors.push(jsonError(content, e)); return { errors, warnings }; }
    if (key.startsWith('templates/') || /^sections\/.*\.json$/.test(key)) {
      if (typeof data.sections !== 'object' || data.sections === null) errors.push({ message: 'Template harus punya objek "sections".' });
      if (data.order && !Array.isArray(data.order)) errors.push({ message: '"order" harus array.' });
    }
    if (key === 'config/settings_schema.json') {
      if (!Array.isArray(data)) errors.push({ message: 'settings_schema.json harus berupa array grup.' });
      else data.forEach((g, i) => checkSettings(g.settings, `grup ${g.name ?? i + 1}`, errors));
    }
  }

  if (key.endsWith('.liquid')) {
    parser ??= createThemeEngine({}, { assetBase: '/' }).liquid;
    const body = content.replace(/{%-?\s*schema\s*-?%}[\s\S]*?{%-?\s*endschema\s*-?%}/, (m) => m.replace(/[^\n]/g, ' '));
    try { parser.parse(body); } catch (e) {
      const line = Number(/line:(\d+)/.exec(e.message)?.[1]) || null;
      errors.push({ line, message: e.message.replace(/, line:\d+, col:\d+/, '').split('\n')[0] });
    }
    if (key.startsWith('sections/')) {
      try {
        const schema = parseSchema(content, key);
        checkSettings(schema.settings, 'schema', errors);
        for (const b of schema.blocks ?? []) {
          if (!b.type) errors.push({ message: 'schema: setiap block wajib punya "type".' });
          checkSettings(b.settings, `block ${b.type}`, errors);
        }
      } catch (e) {
        errors.push({ line: lineAt(content, content.search(/{%-?\s*schema/)), message: e.message });
      }
    }
    // Pencegahan phishing (PRD §8.2): input password hanya wajar di halaman password.
    const pw = content.search(/type\s*=\s*["']?password/i);
    if (pw >= 0 && !/password/.test(key)) warnings.push({ line: lineAt(content, pw), message: 'Ada input type="password". Form yang meminta password/data kartu di situs company bisa dianggap phishing.' });
  }
  return { errors, warnings };
}

/**
 * Validasi seluruh theme (upload ZIP). files = { key: string | null(biner) }.
 * @returns {{ ok: boolean, errors: {file, line?, message}[], warnings: {file, line?, message}[] }}
 */
export function validateTheme(files) {
  const errors = [];
  const warnings = [];
  const keys = Object.keys(files);
  if (keys.length > MAX_FILES) errors.push({ file: '(theme)', message: `Maksimal ${MAX_FILES} file (ada ${keys.length}).` });
  for (const k of REQUIRED) if (!(k in files)) errors.push({ file: k, message: 'File wajib tidak ada.' });
  for (const k of keys) {
    const r = validateFile(k, files[k]);
    errors.push(...r.errors.map((e) => ({ file: k, ...e })));
    warnings.push(...r.warnings.map((w) => ({ file: k, ...w })));
  }
  // Section yang dipakai template harus ada.
  for (const k of keys.filter((x) => /^(templates|sections)\/.*\.json$/.test(x) && typeof files[x] === 'string')) {
    try {
      for (const [id, s] of Object.entries(JSON.parse(files[k]).sections ?? {})) {
        if (!(`sections/${s.type}.liquid` in files)) errors.push({ file: k, message: `Section "${id}" memakai tipe "${s.type}" yang tidak ada (sections/${s.type}.liquid).` });
      }
    } catch { /* sudah dilaporkan sebagai JSON tidak valid */ }
  }
  return { ok: errors.length === 0, errors, warnings };
}
