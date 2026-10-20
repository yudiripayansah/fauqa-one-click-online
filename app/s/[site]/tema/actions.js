'use server';

import { contentAction, revalidateSite, str, go } from '@/lib/content';

const OWNER_ADMIN = ['owner', 'admin'];

export async function addTheme(fd) {
  const { site, slug, supabase } = await contentAction(fd, OWNER_ADMIN);
  const { error } = await supabase.rpc('copy_theme', { p_site: site.id, p_source: str(fd, 'source', 40), p_name: str(fd, 'name', 80) });
  go(`/s/${slug}/tema`, error ? error.message : 'Theme ditambahkan ke daftar theme tersimpan.');
}

export async function publishTheme(fd) {
  const { site, slug, supabase } = await contentAction(fd, OWNER_ADMIN);
  const themeId = str(fd, 'id', 40);
  const { error } = await supabase.from('sites').update({ live_theme_id: themeId }).eq('id', site.id);
  if (error) go(`/s/${slug}/tema`, error.message);
  await supabase.rpc('log_audit', { p_site: site.id, p_action: 'theme.publish', p_detail: { theme: themeId } });
  revalidateSite(site);
  go(`/s/${slug}/tema`, 'Theme dipublish dan langsung tayang.');
}

export async function renameTheme(fd) {
  const { site, slug, supabase } = await contentAction(fd, OWNER_ADMIN);
  const name = str(fd, 'name', 80);
  if (name) await supabase.from('themes').update({ name }).eq('id', str(fd, 'id', 40)).eq('site_id', site.id);
  go(`/s/${slug}/tema`, 'Nama theme disimpan.');
}

export async function deleteTheme(fd) {
  const { site, slug, supabase } = await contentAction(fd, OWNER_ADMIN);
  const { error } = await supabase.from('themes').delete().eq('id', str(fd, 'id', 40)).eq('site_id', site.id);
  await supabase.rpc('log_audit', { p_site: site.id, p_action: 'theme.delete', p_detail: { theme: str(fd, 'id', 40) } });
  go(`/s/${slug}/tema`, error ? error.message : 'Theme dihapus.');
}

// Upload theme .zip (PRD §4.4, §6.7): ditolak bila ada error validasi; laporan per file + baris dikembalikan ke form.
export async function uploadTheme(_prev, fd) {
  const { readThemeZip } = await import('@/lib/theme/zip');
  const { site, session, supabase } = await contentAction(fd, OWNER_ADMIN);
  const file = fd.get('file');
  if (!(file instanceof File) || !file.size) return { error: 'Pilih file .zip.' };
  const { files, binaries, report } = readThemeZip(new Uint8Array(await file.arrayBuffer()));
  if (!report.ok) return { report };

  const { count } = await supabase.from('themes').select('id', { count: 'exact', head: true }).eq('site_id', site.id);
  if (count >= 10) return { error: 'Batas 10 theme tersimpan tercapai. Hapus theme yang tidak dipakai.' };
  let name = file.name.replace(/\.zip$/i, '');
  try { name = JSON.parse(files['config/settings_schema.json']).find((g) => g.theme_name)?.theme_name ?? name; } catch { /* nama dari file */ }

  const { data: theme, error } = await supabase.from('themes').insert({ site_id: site.id, name: name.slice(0, 80), source: 'upload' }).select('id').single();
  if (error) return { error: error.message };
  const fail = async (msg) => { await supabase.from('themes').delete().eq('id', theme.id); return { error: msg }; };
  const rows = Object.entries(files).map(([key, content]) => ({ theme_id: theme.id, key, content, size: Buffer.byteLength(content), updated_by: session.userId }));
  for (const [key, bytes] of Object.entries(binaries)) {
    const path = `${theme.id}/${crypto.randomUUID()}-${key.slice(key.indexOf('/') + 1)}`;
    const { error: e } = await supabase.storage.from('theme-assets').upload(path, bytes, { cacheControl: '31536000', contentType: key.endsWith('.svg') ? 'image/svg+xml' : undefined });
    if (e) return fail(`${key}: ${e.message}`);
    rows.push({ theme_id: theme.id, key, content: null, storage_path: path, size: bytes.length, updated_by: session.userId });
  }
  for (let i = 0; i < rows.length; i += 200) {
    const { error: e } = await supabase.from('theme_files').insert(rows.slice(i, i + 200));
    if (e) return fail(e.message);
  }
  await supabase.rpc('log_audit', { p_site: site.id, p_action: 'theme.upload', p_detail: { theme: theme.id, files: rows.length } });
  return { ok: `Theme "${name}" diunggah (${rows.length} file).`, warnings: report.warnings };
}
