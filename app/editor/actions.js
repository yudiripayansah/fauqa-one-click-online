'use server';

import { updateTag } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireSite } from '@/lib/dal';
import { cleanHtml } from '@/lib/content';
import { siteTag } from '@/lib/site/data';
import { parseSchema } from '@/lib/theme/engine';
import { cleanSectionList, cleanSettingsData } from '@/lib/theme/sanitize';

/**
 * Simpan perubahan editor visual (PRD §4.3). changes = [{ key, content (objek), expected (updated_at saat dibuka) }].
 * @returns {{ ok: true, updatedAt: Record<string,string> } | { error: string, conflict?: boolean }}
 */
export async function saveThemeChanges({ site: slug, themeId, changes }) {
  const { site } = await requireSite(slug);
  const supabase = await createClient();
  if (!Array.isArray(changes) || !changes.length || changes.length > 40) return { error: 'Tidak ada perubahan.' };

  const { data: theme } = await supabase.from('themes').select('id, site_id').eq('id', themeId).eq('site_id', site.id).maybeSingle();
  if (!theme) return { error: 'Theme tidak ditemukan.' };
  const { data: rows } = await supabase.from('theme_files').select('key, content').eq('theme_id', themeId)
    .or(`key.like.sections/%.liquid,key.eq.config/settings_schema.json,key.in.(${changes.map((c) => `"${c.key}"`).join(',')})`);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.content]));
  const schemas = {};
  for (const [k, v] of Object.entries(byKey)) if (k.endsWith('.liquid')) schemas[k.slice(9, -7)] = parseSchema(v, k);
  const opts = { cleanHtml, canCode: ['owner', 'admin'].includes(site.role) };
  const parseOld = (k) => { try { return JSON.parse(byKey[k] ?? 'null'); } catch { return null; } };

  const updatedAt = {};
  try {
    const cleaned = changes.map(({ key, content, expected }) => {
      const value = key === 'config/settings_data.json'
        ? cleanSettingsData(content, parseOld(key), JSON.parse(byKey['config/settings_schema.json'] ?? '[]'), opts)
        : cleanSectionList(content, parseOld(key), schemas, opts);
      return { key, value, expected };
    });
    for (const { key, value, expected } of cleaned) {
      const { data, error } = await supabase.rpc('save_theme_json', { p_theme: themeId, p_key: key, p_content: JSON.stringify(value, null, 2), p_expected: expected ?? null });
      if (error) return { error: error.message.replace(/^KONFLIK: /, ''), conflict: error.code === 'P0409' || /KONFLIK/.test(error.message) };
      updatedAt[key] = data;
    }
  } catch (e) {
    return { error: e.message };
  }
  await supabase.rpc('log_audit', { p_site: site.id, p_action: 'theme.save', p_detail: { theme: themeId, files: Object.keys(updatedAt) } });
  updateTag(siteTag(site.id));
  return { ok: true, updatedAt };
}
