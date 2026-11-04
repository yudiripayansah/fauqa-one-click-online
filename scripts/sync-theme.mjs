// Sinkron satu theme bawaan tanpa membuat akun atau situs demo.
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadThemeDir, themeKeys } from './theme-files.mjs';
import { validateTheme } from '../lib/theme/validate.js';

const key = process.argv[2];
if (!themeKeys().includes(key)) throw new Error(`Pilih theme: ${themeKeys().join(', ')}`);
const { text, binary } = loadThemeDir(key);
if (Object.keys(binary).length) throw new Error('Script ini hanya mendukung theme dengan aset teks. Gunakan upload ZIP untuk aset biner.');
const report = validateTheme(text);
if (!report.ok) throw new Error(JSON.stringify(report.errors, null, 2));
const name = JSON.parse(text['config/settings_schema.json']).find((g) => g.theme_name)?.theme_name ?? key;
if (!process.argv.includes('--apply')) {
  console.log(`${name}: ${Object.keys(text).length} file valid. Tambahkan --apply untuk sinkron ke database.`);
  process.exit(0);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = ({ data, error }) => { if (error) throw error; return data; };
let theme = ok(await db.from('themes').select('id, builtin_version').is('site_id', null).eq('builtin_key', key).maybeSingle());
if (!theme) theme = ok(await db.from('themes').insert({ name, source: 'builtin', builtin_key: key, builtin_version: 1 }).select('id, builtin_version').single());
const existing = Object.fromEntries(ok(await db.from('theme_files').select('key, checksum').eq('theme_id', theme.id)).map((f) => [f.key, f.checksum]));
const rows = Object.entries(text).map(([key, content]) => ({ theme_id: theme.id, key, content, checksum: createHash('sha1').update(content).digest('hex'), size: Buffer.byteLength(content) }));
const changed = rows.filter((r) => existing[r.key] !== r.checksum);
const removed = Object.keys(existing).filter((key) => !(key in text));
if (changed.length) ok(await db.from('theme_files').upsert(changed, { onConflict: 'theme_id,key' }));
if (removed.length) ok(await db.from('theme_files').delete().eq('theme_id', theme.id).in('key', removed));
if ((changed.length || removed.length) && Object.keys(existing).length) ok(await db.from('themes').update({ builtin_version: theme.builtin_version + 1 }).eq('id', theme.id));
console.log(`${name}: ${changed.length} file diperbarui, ${removed.length} dihapus. Theme situs yang sudah tersimpan tetap memakai salinannya.`);
