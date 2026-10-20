'use server';

import { revalidatePath } from 'next/cache';
import { contentAction, revalidateSite, str, go } from '@/lib/content';
import { BUCKET, fileUsage, processUpload, safeName, storagePaths } from '@/lib/files';
import { fileUrl } from '@/lib/site/data';

const FOLDER_RE = /^([a-z0-9][a-z0-9 _-]*(\/[a-z0-9][a-z0-9 _-]*)*)?$/;
const cleanFolder = (v) => String(v ?? '').toLowerCase().trim().replace(/\s*\/\s*/g, '/').replace(/^\/+|\/+$/g, '').slice(0, 120);

// Satu file per panggilan (klien mengunggah berurutan agar tiap file punya status & tidak melewati batas body).
export async function uploadFile(fd) {
  const { site, session, supabase } = await contentAction(fd);
  const file = fd.get('file');
  const folder = cleanFolder(fd.get('folder'));
  if (!(file instanceof File) || !file.size) return { error: 'Pilih file.' };
  if (!FOLDER_RE.test(folder)) return { error: 'Nama folder hanya boleh huruf kecil, angka, spasi, - dan _.' };

  const { data: taken } = await supabase.from('files').select('name').eq('site_id', site.id).eq('folder', folder);
  const { row, error } = await processUpload(supabase, site.id, file, { folder, takenNames: new Set(taken.map((t) => t.name)) });
  if (error) return { error };
  const { error: dbErr } = await supabase.from('files').insert({ ...row, created_by: session.userId });
  if (dbErr) {
    await supabase.storage.from(BUCKET).remove(storagePaths(row));
    return { error: `${file.name}: ${dbErr.message}` };
  }
  revalidateSite(site);
  revalidatePath(`/s/${site.slug}/file`);
  return { ok: true, file: { id: row.id, name: row.name, src: fileUrl(row.storage_path), thumb: row.variants[400] ? fileUrl(row.variants[400]) : fileUrl(row.storage_path), mime: row.mime } };
}

// Untuk pemilih file (editor konten). kind: 'image' | 'any'
export async function listFiles(slug, kind = 'any') {
  const fd = new FormData();
  fd.set('site', slug);
  const { site, supabase } = await contentAction(fd);
  let q = supabase.from('files').select('id, name, folder, storage_path, mime, variants, width, height, alt').eq('site_id', site.id).order('created_at', { ascending: false }).limit(500);
  if (kind === 'image') q = q.like('mime', 'image/%');
  const { data } = await q;
  return data.map((f) => ({
    id: f.id, name: f.name, folder: f.folder, mime: f.mime, alt: f.alt, width: f.width,
    src: fileUrl(f.storage_path),
    thumb: f.variants?.[400] ? fileUrl(f.variants[400]) : fileUrl(f.storage_path),
    large: fileUrl(f.variants?.[1200] ?? f.variants?.[800] ?? f.storage_path),
  }));
}

export async function updateFile(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  const id = str(fd, 'id', 40);
  const folder = cleanFolder(fd.get('folder'));
  const back = `/s/${slug}/file?file=${id}${folder ? `&folder=${encodeURIComponent(folder)}` : ''}`;
  if (!FOLDER_RE.test(folder)) go(back, 'Nama folder tidak valid.');
  const { data: f } = await supabase.from('files').select('name, folder').eq('id', id).eq('site_id', site.id).single();
  let name = str(fd, 'name', 200).replace(/[/\\]/g, '') || f.name;
  if (name !== f.name || folder !== f.folder) {
    const { data: taken } = await supabase.from('files').select('name').eq('site_id', site.id).eq('folder', folder).neq('id', id);
    name = safeName(name, new Set(taken.map((t) => t.name)));
  }
  const { error } = await supabase.from('files').update({ name, folder, alt: str(fd, 'alt', 300) }).eq('id', id).eq('site_id', site.id);
  if (error) go(back, error.message);
  revalidateSite(site);
  go(back, 'File disimpan.');
}

export async function deleteFile(fd) {
  const { site, slug, supabase } = await contentAction(fd);
  const id = str(fd, 'id', 40);
  const { data: f } = await supabase.from('files').select('*').eq('id', id).eq('site_id', site.id).single();
  const folder = f.folder ? `?folder=${encodeURIComponent(f.folder)}` : '';
  const used = await fileUsage(supabase, f);
  if (used.length && fd.get('force') !== 'on') go(`/s/${slug}/file?file=${id}${folder ? `&${folder.slice(1)}` : ''}`, 'File masih dipakai. Centang konfirmasi untuk tetap menghapus.');
  // Hapus objek Storage dulu; bila gagal, baris file dipertahankan agar tidak ada objek yatim.
  const { data: removed, error } = await supabase.storage.from(BUCKET).remove(storagePaths(f));
  if (error || removed.length === 0) go(`/s/${slug}/file?file=${id}`, `File gagal dihapus dari storage${error ? `: ${error.message}` : ''}.`);
  await supabase.from('files').delete().eq('id', id).eq('site_id', site.id);
  revalidateSite(site);
  go(`/s/${slug}/file${folder}`, 'File dihapus.');
}
