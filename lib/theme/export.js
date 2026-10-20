// Isi file theme untuk .zip (unduh theme & ekspor situs). Aset biner diambil dari Storage publik.
import { strToU8 } from 'fflate';
import { themeAssetUrl } from '@/lib/site/data';

export async function themeZipEntries(supabase, themeId, prefix = '') {
  const { data: files } = await supabase.from('theme_files').select('key, content, storage_path').eq('theme_id', themeId);
  const entries = {};
  await Promise.all((files ?? []).map(async (f) => {
    if (f.content != null) entries[prefix + f.key] = strToU8(f.content);
    else {
      const res = await fetch(themeAssetUrl(f.storage_path));
      if (res.ok) entries[prefix + f.key] = new Uint8Array(await res.arrayBuffer());
    }
  }));
  return entries;
}

export const fileSlug = (s, fallback) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback;
