// Helper Server Action modul konten (PRD §4.5). Dipakai oleh app/s/[site]/<modul>/actions.js.
import { redirect } from 'next/navigation';
import { updateTag } from 'next/cache';
import sanitizeHtml from 'sanitize-html';
import { createClient } from '@/lib/supabase/server';
import { requireSite } from '@/lib/dal';
import { siteTag } from '@/lib/site/data';

// Rich text dari editor (TipTap) disanitasi dengan allowlist sebelum disimpan (PRD §8.2).
const RICHTEXT = {
  allowedTags: ['p', 'br', 'h2', 'h3', 'h4', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
  allowedAttributes: { a: ['href', 'title', 'target', 'rel'], img: ['src', 'alt', 'width', 'height', 'loading'], th: ['colspan', 'rowspan'], td: ['colspan', 'rowspan'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  transformTags: {
    a: (tag, attribs) => ({ tagName: 'a', attribs: attribs.target === '_blank' ? { ...attribs, rel: 'noopener noreferrer' } : attribs }),
    img: (tag, attribs) => ({ tagName: 'img', attribs: { ...attribs, loading: 'lazy' } }),
  },
};
export const cleanHtml = (html) => sanitizeHtml(String(html ?? ''), RICHTEXT).trim();

export const toHandle = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
export const HANDLE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const str = (fd, k, max = 500) => String(fd.get(k) ?? '').trim().slice(0, max);
export const ids = (fd, k) => fd.getAll(k).map(String).filter((v) => /^[0-9a-f-]{36}$/.test(v));
export const seoFrom = (fd) => ({ title: str(fd, 'seo_title', 120), description: str(fd, 'seo_description', 320), noindex: fd.get('seo_noindex') === 'on' });

// Otorisasi + klien RLS untuk Server Action. Semua anggota (termasuk editor) boleh mengelola konten.
export async function contentAction(fd, roles) {
  const slug = String(fd.get('site') ?? '');
  const { session, site } = await requireSite(slug, roles);
  return { session, site, slug, supabase: await createClient() };
}

// Situs publik memakai data baru setelah disimpan (PRD §7).
export const revalidateSite = (site) => updateTag(siteTag(site.id));

export const go = (path, msg) => redirect(msg ? `${path}${path.includes('?') ? '&' : '?'}msg=${encodeURIComponent(msg)}` : path);

// Pesan error Postgres → bahasa pengguna.
export function dbError(error, what = 'Data') {
  if (!error) return null;
  if (error.code === '23505') return `${what} dengan handle/URL itu sudah ada.`;
  if (error.code === '23514') return 'Ada isian yang formatnya tidak valid.';
  return error.message;
}

// Suffix template alternatif yang tersedia di theme live, mis. ['contact'] dari templates/page.contact.json.
export async function templateSuffixes(supabase, siteId, type) {
  const { data: s } = await supabase.from('sites').select('live_theme_id').eq('id', siteId).single();
  if (!s?.live_theme_id) return [];
  const { data } = await supabase.from('theme_files').select('key').eq('theme_id', s.live_theme_id).like('key', `templates/${type}.%.json`);
  return data.map((f) => f.key.slice(`templates/${type}.`.length, -5)).sort();
}

export { parseLocal as parseDate } from '@/lib/tz';
