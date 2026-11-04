import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { loadThemeDir, themeKeys } from './theme-files.mjs';
import { readThemeZip } from '../lib/theme/zip.js';

const key = process.argv[2];
if (!themeKeys().includes(key)) throw new Error(`Pilih theme: ${themeKeys().join(', ')}`);
const { text, binary } = loadThemeDir(key);
const bytes = zipSync({ ...Object.fromEntries(Object.entries(text).map(([k, v]) => [k, strToU8(v)])), ...binary });
const { report } = readThemeZip(bytes);
if (!report.ok) throw new Error(JSON.stringify(report.errors, null, 2));
mkdirSync('artifacts', { recursive: true });
const path = resolve('artifacts', `${key}-theme.zip`);
writeFileSync(path, bytes);
console.log(`${path} (${Object.keys(text).length + Object.keys(binary).length} file, ${bytes.length} byte)`);
