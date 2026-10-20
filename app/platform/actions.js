'use server';

// Aksi platform admin (PRD §5). Setiap aksi memeriksa requirePlatformAdmin; RLS juga hanya mengizinkan platform admin.
import { createHash, randomUUID } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { requirePlatformAdmin } from '@/lib/dal';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { go } from '@/lib/content';
import { siteTag } from '@/lib/site/data';
import { readThemeZip } from '@/lib/theme/zip';

const back = (fd, fallback) => { const r = String(fd.get('back') ?? ''); return /^\/platform(\/|\?|$)/.test(r) ? r : fallback; };

export async function setSuspended(fd) {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const id = String(fd.get('id'));
  const suspend = fd.get('suspend') === '1';
  const reason = String(fd.get('reason') ?? '').trim().slice(0, 500);
  if (suspend && !reason) go(back(fd, '/platform'), 'Isi alasan suspend; alasan ini terlihat oleh pemilik situs.');
  const { error } = await supabase.from('sites').update(suspend ? { status: 'suspended', suspended_reason: reason } : { status: 'unpublished', suspended_reason: null }).eq('id', id);
  if (error) go(back(fd, '/platform'), error.message);
  await supabase.rpc('log_audit', { p_site: id, p_action: suspend ? 'platform.suspend' : 'platform.unsuspend', p_detail: { reason } });
  if (fd.get('report')) await supabase.from('abuse_reports').update({ status: 'actioned', handled_at: new Date().toISOString() }).eq('site_id', id).eq('status', 'new');
  revalidateTag(siteTag(id), { expire: 0 });
  go(back(fd, '/platform'), suspend ? 'Situs disuspend dan langsung offline.' : 'Suspend dicabut. Situs offline sampai pemiliknya publish lagi.');
}

export async function dismissReport(fd) {
  await requirePlatformAdmin();
  const supabase = await createClient();
  await supabase.from('abuse_reports').update({ status: 'dismissed', handled_at: new Date().toISOString() }).eq('id', String(fd.get('id')));
  go('/platform/laporan', 'Laporan diabaikan.');
}

export async function savePreset(fd) {
  await requirePlatformAdmin();
  const key = String(fd.get('key') ?? '');
  let data;
  try { data = JSON.parse(String(fd.get('data') ?? '')); } catch (e) { go(`/platform/preset?key=${key}`, `JSON tidak valid: ${e.message}`); }
  const pagesOk = (c) => c && ['tentang-kami', 'kontak', 'kebijakan-privasi'].every((k) => c.pages?.[k]?.title) && c.hero?.heading && c.products?.length && c.articles?.length;
  if (!pagesOk(data.id) || !pagesOk(data.en)) go(`/platform/preset?key=${key}`, 'Preset wajib punya "id" dan "en" dengan hero, pages (tentang-kami, kontak, kebijakan-privasi), products, dan articles.');
  const supabase = await createClient();
  const { error } = await supabase.from('industry_presets').update({ name: String(fd.get('name') ?? key).slice(0, 60), data, updated_at: new Date().toISOString() }).eq('key', key);
  if (error) go(`/platform/preset?key=${key}`, error.message);
  go(`/platform/preset?key=${key}`, 'Preset disimpan. Berlaku untuk situs baru.');
}

export async function savePlan(fd) {
  await requirePlatformAdmin();
  const id = String(fd.get('id'));
  const limits = {};
  for (const [k, v] of fd.entries()) {
    const m = /^limit:([a-z_]+)$/.exec(k);
    if (m && String(v).trim() !== '') limits[m[1]] = Math.max(0, Number.parseInt(v, 10) || 0);
  }
  // plans tidak punya policy tulis untuk user; ditulis server setelah cek platform admin.
  const { error } = await createAdminClient().from('plans').update({ limits }).eq('id', id);
  if (error) go('/platform/plan', error.message);
  go('/platform/plan', 'Batas kuota disimpan. Kosong = tanpa batas.');
}

// Versi baru theme bawaan dari .zip (PRD §5). Situs yang sudah menyalin theme ini tidak berubah.
export async function uploadBuiltin(fd) {
  await requirePlatformAdmin();
  const key = String(fd.get('key') ?? '');
  const file = fd.get('file');
  if (!(file instanceof File) || !file.size) go('/platform/theme', 'Pilih file .zip.');
  const { files, binaries, report } = readThemeZip(new Uint8Array(await file.arrayBuffer()));
  if (!report.ok) go('/platform/theme', `Theme tidak valid: ${report.errors.slice(0, 3).map((e) => `${e.file}${e.line ? `:${e.line}` : ''} ${e.message}`).join('; ')}`);
  const db = createAdminClient();
  const { data: theme } = await db.from('themes').select('id, builtin_version').is('site_id', null).eq('builtin_key', key).maybeSingle();
  if (!theme) go('/platform/theme', 'Theme tidak ditemukan.');
  const rows = Object.entries(files).map(([k, content]) => ({ theme_id: theme.id, key: k, content, storage_path: null, checksum: createHash('sha1').update(content).digest('hex'), size: Buffer.byteLength(content) }));
  for (const [k, bytes] of Object.entries(binaries)) {
    const path = `builtin/${key}/${randomUUID()}-${k.slice(7)}`;
    const { error } = await db.storage.from('theme-assets').upload(path, bytes, { contentType: k.endsWith('.svg') ? 'image/svg+xml' : undefined, cacheControl: '31536000' });
    if (error) go('/platform/theme', error.message);
    rows.push({ theme_id: theme.id, key: k, content: null, storage_path: path, checksum: createHash('sha1').update(bytes).digest('hex'), size: bytes.length });
  }
  await db.from('theme_files').delete().eq('theme_id', theme.id);
  const { error } = await db.from('theme_files').insert(rows);
  if (error) go('/platform/theme', error.message);
  await db.from('themes').update({ builtin_version: theme.builtin_version + 1 }).eq('id', theme.id);
  go('/platform/theme', `Theme ${key} versi ${theme.builtin_version + 1} diterbitkan untuk situs baru.`);
}
