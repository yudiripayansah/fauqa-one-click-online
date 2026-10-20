'use server';

// Editor kode theme (PRD §4.4): hanya owner/admin. Setiap simpan divalidasi (PRD §6.7); file yang gagal
// validasi tidak pernah menimpa file yang sedang tayang (PRD §9).
import { updateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireSite } from '@/lib/dal';
import { siteTag, themeAssetUrl } from '@/lib/site/data';
import { REQUIRED, TEXT_EXT, checkKey, validateFile } from '@/lib/theme/validate';

const BUCKET = 'theme-assets';
const MAX_ASSET = 5 * 1024 * 1024;

async function ctx(slug, themeId) {
  const { site, session } = await requireSite(slug, ['owner', 'admin']);
  const supabase = await createClient();
  const { data: theme } = await supabase.from('themes').select('id, name').eq('id', themeId).eq('site_id', site.id).maybeSingle();
  if (!theme) throw new Error('Theme tidak ditemukan.');
  const done = async (action, detail) => {
    await supabase.rpc('log_audit', { p_site: site.id, p_action: `theme.code.${action}`, p_detail: { theme: themeId, ...detail } });
    updateTag(siteTag(site.id));
  };
  return { site, session, supabase, theme, done };
}

// Isi awal file baru per folder.
const STARTER = {
  sections: (name) => `<section class="section" {{ section.fauqa_attributes }}>\n  <div class="container">\n    <h2>{{ section.settings.heading }}</h2>\n  </div>\n</section>\n\n{% schema %}\n{\n  "name": "${name}",\n  "settings": [{ "type": "text", "id": "heading", "label": "Judul", "default": "${name}" }],\n  "presets": [{ "name": "${name}" }]\n}\n{% endschema %}\n`,
  templates: () => '{\n  "sections": {},\n  "order": []\n}\n',
  locales: () => '{}\n',
};

export async function openFile({ site, themeId, key }) {
  const { supabase } = await ctx(site, themeId);
  const { data: f } = await supabase.from('theme_files').select('key, content, storage_path, updated_at, size').eq('theme_id', themeId).eq('key', key).maybeSingle();
  if (!f) return { error: 'File tidak ditemukan.' };
  return f.content != null ? { content: f.content, updatedAt: f.updated_at } : { binary: true, url: themeAssetUrl(f.storage_path), size: f.size };
}

export async function saveFile({ site, themeId, key, content, expected }) {
  try {
    const { supabase, session, done } = await ctx(site, themeId);
    const { errors, warnings } = validateFile(key, content);
    if (errors.length) return { errors, warnings };
    const { data: cur } = await supabase.from('theme_files').select('id, updated_at').eq('theme_id', themeId).eq('key', key).maybeSingle();
    if (cur && expected && new Date(cur.updated_at) > new Date(expected)) {
      return { errors: [{ message: 'File ini sudah diubah orang lain sejak Anda membukanya. Muat ulang file untuk melihat versi terbaru.' }], conflict: true };
    }
    const row = { content, size: Buffer.byteLength(content), updated_at: new Date().toISOString(), updated_by: session.userId };
    const { data, error } = cur
      ? await supabase.from('theme_files').update(row).eq('id', cur.id).select('updated_at').single()
      : await supabase.from('theme_files').insert({ ...row, theme_id: themeId, key }).select('updated_at').single();
    if (error) return { errors: [{ message: error.message }] };
    await done('save', { key });
    return { ok: true, updatedAt: data.updated_at, warnings };
  } catch (e) {
    return { errors: [{ message: e.message }] };
  }
}

export async function createFile({ site, themeId, key }) {
  try {
    const { supabase, session, done } = await ctx(site, themeId);
    const keyErr = checkKey(key);
    if (keyErr) return { error: keyErr };
    if (!TEXT_EXT.test(key)) return { error: 'File gambar/font: pakai tombol Unggah aset.' };
    const folder = key.split('/')[0];
    const name = key.split('/')[1].replace(/\.[^.]+$/, '');
    const content = STARTER[folder]?.(name) ?? '';
    const { error } = await supabase.from('theme_files').insert({ theme_id: themeId, key, content, size: content.length, updated_by: session.userId });
    if (error) return { error: error.code === '23505' ? 'File dengan nama itu sudah ada.' : error.message };
    await done('create', { key });
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

export async function renameFile({ site, themeId, key, to }) {
  try {
    const { supabase, done } = await ctx(site, themeId);
    if (REQUIRED.includes(key)) return { error: 'File wajib tidak bisa diganti nama.' };
    const keyErr = checkKey(to);
    if (keyErr) return { error: keyErr };
    if (key.split('/')[0] !== to.split('/')[0]) return { error: 'Folder tidak bisa diganti, hanya nama file.' };
    const { error } = await supabase.from('theme_files').update({ key: to }).eq('theme_id', themeId).eq('key', key);
    if (error) return { error: error.code === '23505' ? 'File dengan nama itu sudah ada.' : error.message };
    await done('rename', { key, to });
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

export async function deleteFile({ site, themeId, key }) {
  try {
    const { supabase, done } = await ctx(site, themeId);
    if (REQUIRED.includes(key)) return { error: 'File wajib tidak bisa dihapus.' };
    const { data: f } = await supabase.from('theme_files').select('id, storage_path').eq('theme_id', themeId).eq('key', key).single();
    await supabase.from('theme_files').delete().eq('id', f.id);
    // Objek Storage dipakai bersama theme hasil duplikat: hapus hanya bila tak dirujuk lagi.
    if (f.storage_path) {
      const { count } = await supabase.from('theme_files').select('id', { count: 'exact', head: true }).eq('storage_path', f.storage_path);
      if (!count) await supabase.storage.from(BUCKET).remove([f.storage_path]);
    }
    await done('delete', { key });
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

// Unggah aset ke assets/: teks (css/js/svg/json) disimpan di DB, biner ke Storage theme-assets/<theme>/<uuid>-<nama>.
export async function uploadAsset(fd) {
  try {
    const { supabase, session, done } = await ctx(String(fd.get('site')), String(fd.get('themeId')));
    const themeId = String(fd.get('themeId'));
    const file = fd.get('file');
    if (!(file instanceof File) || !file.size) return { error: 'Pilih file.' };
    if (file.size > MAX_ASSET) return { error: 'Aset maksimal 5 MB.' };
    const key = `assets/${file.name.replace(/[^A-Za-z0-9_.-]+/g, '-')}`;
    const keyErr = checkKey(key);
    if (keyErr) return { error: keyErr };
    const { data: cur } = await supabase.from('theme_files').select('id').eq('theme_id', themeId).eq('key', key).maybeSingle();
    let row;
    if (TEXT_EXT.test(key)) {
      const content = await file.text();
      const { errors } = validateFile(key, content);
      if (errors.length) return { error: errors[0].message };
      row = { content, storage_path: null, size: content.length };
    } else {
      const path = `${themeId}/${crypto.randomUUID()}-${key.slice(7)}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || 'application/octet-stream', cacheControl: '31536000' });
      if (error) return { error: error.message };
      row = { content: null, storage_path: path, size: file.size };
    }
    const { error } = cur
      ? await supabase.from('theme_files').update({ ...row, updated_by: session.userId, updated_at: new Date().toISOString() }).eq('id', cur.id)
      : await supabase.from('theme_files').insert({ ...row, theme_id: themeId, key, updated_by: session.userId });
    if (error) return { error: error.message };
    await done('upload', { key });
    return { ok: true, key };
  } catch (e) {
    return { error: e.message };
  }
}

export async function listVersions({ site, themeId, key }) {
  const { supabase } = await ctx(site, themeId);
  const { data: f } = await supabase.from('theme_files').select('id').eq('theme_id', themeId).eq('key', key).maybeSingle();
  if (!f) return [];
  const { data } = await supabase.from('theme_file_versions').select('id, content, created_at, created_by').eq('theme_file_id', f.id).order('id', { ascending: false });
  const ids = [...new Set(data.map((v) => v.created_by).filter(Boolean))];
  const { data: people } = ids.length ? await supabase.from('profiles').select('user_id, name').in('user_id', ids) : { data: [] };
  const name = Object.fromEntries(people.map((p) => [p.user_id, p.name]));
  return data.map((v) => ({ id: v.id, content: v.content, at: v.created_at, by: name[v.created_by] ?? '' }));
}
