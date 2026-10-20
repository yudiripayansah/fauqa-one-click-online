// Baca theme bawaan dari disk: themes/_shared/ (section, snippet, locale, template umum) ditimpa themes/<key>/.
// → { text: { 'sections/hero.liquid': '...' }, binary: { 'assets/logo.png': Buffer } }
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const TEXT = /\.(liquid|json|css|js|svg|txt)$/;

export const themeKeys = () => readdirSync(new URL('../themes/', import.meta.url)).filter((k) => !k.startsWith('_') && !k.startsWith('.'));

export function loadThemeDir(key) {
  const out = { text: {}, binary: {} };
  for (const base of ['_shared', key]) {
    const root = new URL(`../themes/${base}/`, import.meta.url);
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root)) {
      for (const f of readdirSync(new URL(`${dir}/`, root))) {
        const k = `${dir}/${f}`;
        if (TEXT.test(f)) out.text[k] = readFileSync(new URL(k, root), 'utf8');
        else out.binary[k] = readFileSync(new URL(k, root));
      }
    }
  }
  return out;
}
