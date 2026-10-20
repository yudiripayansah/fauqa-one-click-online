// Baca .zip theme (PRD §6.7): batas ukuran & jumlah file, buang folder pembungkus & file sistem, cegah path traversal.
import { unzipSync, strFromU8 } from 'fflate';
import { MAX_FILES, TEXT_EXT, validateTheme } from './validate.js';

export const MAX_ZIP = 50 * 1024 * 1024;
const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|\.git)(\/|$)/;

/** @returns {{ files?: Record<string,string>, binaries?: Record<string,Uint8Array>, report: ReturnType<validateTheme> }} */
export function readThemeZip(bytes) {
  if (bytes.length > MAX_ZIP) return { report: { ok: false, errors: [{ file: '(zip)', message: 'ZIP maksimal 50 MB.' }], warnings: [] } };
  let raw;
  let count = 0;
  try {
    // filter dipanggil per entri sebelum didekompres: batasi jumlah & ukuran asli total.
    let total = 0;
    raw = unzipSync(bytes, { filter: (f) => { count++; total += f.originalSize; return count <= MAX_FILES + 50 && total <= 200 * 1024 * 1024 && !f.name.endsWith('/') && !JUNK.test(f.name); } });
  } catch (e) {
    return { report: { ok: false, errors: [{ file: '(zip)', message: `ZIP tidak bisa dibaca: ${e.message}` }], warnings: [] } };
  }
  let names = Object.keys(raw);
  if (names.some((n) => n.startsWith('/') || n.split('/').includes('..') || n.includes('\\'))) {
    return { report: { ok: false, errors: [{ file: '(zip)', message: 'ZIP berisi path tidak aman (../ atau path absolut).' }], warnings: [] } };
  }
  // ZIP dari "Compress folder" punya satu folder pembungkus: buang.
  const roots = new Set(names.map((n) => n.split('/')[0]));
  const strip = roots.size === 1 && !['layout', 'templates', 'sections', 'snippets', 'assets', 'config', 'locales'].includes([...roots][0]);
  const files = {};
  const binaries = {};
  const forCheck = {};
  for (const n of names) {
    const key = strip ? n.split('/').slice(1).join('/') : n;
    if (TEXT_EXT.test(key)) forCheck[key] = files[key] = strFromU8(raw[n]);
    else { binaries[key] = raw[n]; forCheck[key] = null; }
  }
  names = Object.keys(forCheck);
  const report = validateTheme(forCheck);
  for (const [k, b] of Object.entries(binaries)) if (b.length > 5 * 1024 * 1024) report.errors.push({ file: k, message: 'Aset maksimal 5 MB.' });
  report.ok = report.errors.length === 0;
  return { files, binaries, report };
}
