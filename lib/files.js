// File manager (PRD §4.8): validasi isi file, varian WebP, sanitasi SVG, cek pemakaian. Server saja.
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import sanitizeHtml from 'sanitize-html';
import { toHandle } from '@/lib/content';
import { fileUrl } from '@/lib/site/data';

export const BUCKET = 'site-files';
const MB = 1024 * 1024;
const WIDTHS = [400, 800, 1200, 1920];

// Tipe dikenali dari isi file (magic bytes), bukan ekstensi saja.
const KINDS = [
  { mime: 'image/jpeg', ext: ['jpg', 'jpeg'], max: 10 * MB, test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: ['png'], max: 10 * MB, test: (b) => b.subarray(0, 4).toString('hex') === '89504e47' },
  { mime: 'image/gif', ext: ['gif'], max: 10 * MB, test: (b) => b.subarray(0, 4).toString() === 'GIF8' },
  { mime: 'image/webp', ext: ['webp'], max: 10 * MB, test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { mime: 'image/svg+xml', ext: ['svg'], max: 2 * MB, test: (b) => /<svg[\s>]/i.test(b.subarray(0, 2048).toString()) },
  { mime: 'video/mp4', ext: ['mp4'], max: 50 * MB, test: (b) => b.subarray(4, 8).toString() === 'ftyp' },
  { mime: 'video/webm', ext: ['webm'], max: 50 * MB, test: (b) => b.subarray(0, 4).toString('hex') === '1a45dfa3' },
  { mime: 'application/pdf', ext: ['pdf'], max: 20 * MB, test: (b) => b.subarray(0, 5).toString() === '%PDF-' },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: ['docx'], max: 20 * MB, test: (b) => b.subarray(0, 4).toString('hex') === '504b0304' },
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: ['xlsx'], max: 20 * MB, test: (b) => b.subarray(0, 4).toString('hex') === '504b0304' },
  { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: ['pptx'], max: 20 * MB, test: (b) => b.subarray(0, 4).toString('hex') === '504b0304' },
  { mime: 'font/woff2', ext: ['woff2'], max: 5 * MB, test: (b) => b.subarray(0, 4).toString() === 'wOF2' },
];
export const ACCEPT = KINDS.flatMap((k) => k.ext.map((e) => `.${e}`)).join(',');

const SVG = {
  allowedTags: ['svg', 'g', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect', 'text', 'tspan', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'mask', 'use', 'symbol', 'title', 'desc'],
  allowedAttributes: { '*': ['id', 'class', 'd', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'viewBox', 'points', 'fill', 'fill-rule', 'clip-rule', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity', 'transform', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'clip-path', 'mask', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'xmlns', 'href', 'xlink:href', 'preserveAspectRatio', 'version'] },
  allowedSchemes: [],                 // href hanya boleh '#id' (tanpa javascript:/data:)
  allowedSchemesAppliedToAttributes: ['href', 'xlink:href'],
  parser: { lowerCaseTags: false, lowerCaseAttributeNames: false, xmlMode: true },
};

export const kindOf = (mime) => (mime?.startsWith('image/') ? 'image' : mime?.startsWith('video/') ? 'video' : mime?.startsWith('font/') ? 'font' : 'document');
export const formatSize = (n) => (n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Nama tampil yang aman & unik di folder (logo.png → logo-1.png).
export function safeName(name, taken) {
  const clean = String(name).normalize('NFKC').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, ' ').trim().slice(-120) || 'file';
  const dot = clean.lastIndexOf('.');
  const [base, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ''];
  let out = clean;
  for (let i = 1; taken.has(out); i++) out = `${base}-${i}${ext}`;
  return out;
}

/**
 * Validasi + unggah satu file (+ varian WebP) ke Storage memakai klien user (RLS Storage berlaku).
 * @returns {Promise<{ row?: object, error?: string }>} row untuk tabel files (belum di-insert)
 */
export async function processUpload(supabase, siteId, file, { folder, takenNames }) {
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split('.').pop().toLowerCase();
  const kind = KINDS.find((k) => k.ext.includes(ext) && k.test(buf));
  if (!kind) return { error: `${file.name}: tipe file tidak didukung atau isinya tidak sesuai ekstensi.` };
  if (buf.length > kind.max) return { error: `${file.name}: maksimal ${kind.max / MB} MB.` };

  const id = randomUUID();
  const name = safeName(file.name, takenNames);
  const dir = `${siteId}/${id}`;
  const key = `${dir}/${toHandle(name.replace(/\.[^.]+$/, '')) || 'file'}.${kind.ext[0]}`;
  let body = buf;
  let width = null;
  let height = null;
  const variants = {};
  const uploads = [];

  if (kind.mime === 'image/svg+xml') {
    body = Buffer.from(sanitizeHtml(buf.toString('utf8'), SVG));
  } else if (kind.mime.startsWith('image/')) {
    try {
      const meta = await sharp(buf).metadata();
      ({ width, height } = meta);
      // GIF animasi dibiarkan apa adanya; lainnya dibuat varian WebP selebar ≤ aslinya.
      if (!(kind.mime === 'image/gif' && (meta.pages ?? 1) > 1)) {
        for (const w of WIDTHS.filter((w) => w < width).concat(width < 1920 ? [Math.min(width, 1920)] : [])) {
          const out = await sharp(buf).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
          variants[w] = `${dir}/${w}.webp`;
          uploads.push([variants[w], out, 'image/webp']);
        }
      }
    } catch {
      return { error: `${file.name}: gambar rusak atau tidak bisa dibaca.` };
    }
  }
  uploads.unshift([key, body, kind.mime]);

  const done = [];
  for (const [path, data, contentType] of uploads) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, data, { contentType, cacheControl: '31536000', upsert: false });
    if (error) {
      if (done.length) await supabase.storage.from(BUCKET).remove(done);
      return { error: `${file.name}: ${error.message}` };
    }
    done.push(path);
  }
  return { row: { id, site_id: siteId, folder, name, storage_path: key, mime: kind.mime, size: body.length, width, height, variants } };
}

export const storagePaths = (f) => [f.storage_path, ...Object.values(f.variants ?? {})];

// Dipakai di mana (PRD §4.8): produk, koleksi, artikel, dan isi rich text yang memuat URL file.
export async function fileUsage(supabase, f) {
  const url = fileUrl(f.storage_path);
  const like = `%${f.storage_path.split('/').slice(0, 2).join('/')}%`;
  const [prod, col, art, pages, prodBody, artBody] = await Promise.all([
    supabase.from('products').select('id, title').eq('site_id', f.site_id).or(`media.cs.{${f.id}},downloads.cs.{${f.id}}`),
    supabase.from('collections').select('id, title').eq('site_id', f.site_id).eq('image', f.id),
    supabase.from('articles').select('id, title').eq('site_id', f.site_id).eq('cover', f.id),
    supabase.from('pages').select('id, title').eq('site_id', f.site_id).ilike('body', like),
    supabase.from('products').select('id, title').eq('site_id', f.site_id).ilike('body', like),
    supabase.from('articles').select('id, title').eq('site_id', f.site_id).ilike('body', like),
  ]);
  const seen = new Set();
  return [
    ...(prod.data ?? []).map((r) => ({ ...r, type: 'Produk', href: `produk/${r.id}` })),
    ...(prodBody.data ?? []).map((r) => ({ ...r, type: 'Produk', href: `produk/${r.id}` })),
    ...(col.data ?? []).map((r) => ({ ...r, type: 'Koleksi', href: `koleksi/${r.id}` })),
    ...(art.data ?? []).map((r) => ({ ...r, type: 'Artikel', href: `blog/artikel/${r.id}` })),
    ...(artBody.data ?? []).map((r) => ({ ...r, type: 'Artikel', href: `blog/artikel/${r.id}` })),
    ...(pages.data ?? []).map((r) => ({ ...r, type: 'Halaman', href: `halaman/${r.id}` })),
  ].filter((r) => !seen.has(r.type + r.id) && seen.add(r.type + r.id)).map((r) => ({ ...r, url }));
}

// File untuk nilai awal FilePicker, urutan mengikuti `ids`.
export async function fileRefs(supabase, siteId, ids = []) {
  if (!ids?.length) return [];
  const { data } = await supabase.from('files').select('id, name, mime, storage_path, variants, alt').eq('site_id', siteId).in('id', ids);
  const byId = new Map(data.map((f) => [f.id, {
    id: f.id, name: f.name, mime: f.mime, alt: f.alt, src: fileUrl(f.storage_path),
    thumb: fileUrl(f.variants?.[400] ?? f.storage_path), large: fileUrl(f.variants?.[1200] ?? f.variants?.[800] ?? f.storage_path),
  }]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}
