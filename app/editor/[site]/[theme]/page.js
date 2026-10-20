// Theme editor visual (PRD §4.3). Layar penuh, di luar layout admin situs.
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { createPreviewToken } from '@/lib/preview';
import { siteUrl } from '@/lib/hosts';
import { parseSchema } from '@/lib/theme/engine';
import ThemeEditor from '@/components/editor/ThemeEditor';

export const metadata = { title: 'Customize theme' };

const EDITABLE = /^(templates\/[a-z0-9_-]+(\.[a-z0-9_-]+)?\.json|sections\/[a-z0-9_-]+\.json|config\/settings_data\.json)$/;

async function Editor({ params }) {
  const { site: slug, theme: themeId } = await params;
  const { session, site } = await requireSite(slug);
  const supabase = await createClient();
  const { data: theme } = await supabase.from('themes').select('id, name, site_id').eq('id', themeId).eq('site_id', site.id).maybeSingle();
  if (!theme) notFound();

  const [{ data: rows }, { data: s }, { data: pages }, { data: products }, { data: collections }, { data: blogs }, { data: articles }, { data: menus }] = await Promise.all([
    supabase.from('theme_files').select('key, content, updated_at').eq('theme_id', themeId).or('key.like.templates/%,key.like.sections/%,key.like.config/%'),
    supabase.from('sites').select('live_theme_id').eq('id', site.id).single(),
    supabase.from('pages').select('handle, title, template_suffix').eq('site_id', site.id).order('title'),
    supabase.from('products').select('handle, title, template_suffix').eq('site_id', site.id).order('title').limit(500),
    supabase.from('collections').select('handle, title').eq('site_id', site.id).order('title'),
    supabase.from('blogs').select('id, handle, title').eq('site_id', site.id).order('title'),
    supabase.from('articles').select('handle, title, blog_id').eq('site_id', site.id).order('published_at', { ascending: false }).limit(200),
    supabase.from('menus').select('handle, title').eq('site_id', site.id).order('title'),
  ]);

  const files = {};
  const updatedAt = {};
  const schemas = {};
  let settingsSchema = [];
  for (const r of rows) {
    if (EDITABLE.test(r.key)) {
      try { files[r.key] = JSON.parse(r.content); updatedAt[r.key] = r.updated_at; } catch { /* file rusak: lewati */ }
    } else if (/^sections\/.*\.liquid$/.test(r.key)) {
      try { schemas[r.key.slice(9, -7)] = parseSchema(r.content, r.key); } catch { /* schema rusak: section tidak bisa ditambah */ }
    } else if (r.key === 'config/settings_schema.json') {
      try { settingsSchema = JSON.parse(r.content); } catch { /* */ }
    }
  }

  // Halaman contoh untuk setiap template (template switcher).
  const blogHandle = Object.fromEntries(blogs.map((b) => [b.id, b.handle]));
  const sample = {
    index: '/', page: pages[0] && `/pages/${pages[0].handle}`, product: products[0] && `/products/${products[0].handle}`,
    collection: '/collections/all', 'list-collections': '/collections', blog: blogs[0] && `/blogs/${blogs[0].handle}`,
    article: articles[0] && `/blogs/${blogHandle[articles[0].blog_id]}/${articles[0].handle}`, search: '/search?q=a', 404: '/__halaman-tidak-ada',
  };
  const templates = Object.keys(files).filter((k) => k.startsWith('templates/')).map((k) => {
    const name = k.slice(10, -5);
    const [type, suffix] = name.split('.');
    // Template alternatif: pakai halaman yang memang memakai suffix itu bila ada.
    const uses = suffix && (type === 'page' ? pages : type === 'product' ? products : []).find((x) => x.template_suffix === suffix);
    const path = uses ? `/${type === 'page' ? 'pages' : 'products'}/${uses.handle}` : sample[type];
    return { key: k, name, type, suffix: suffix ?? null, path: path ?? null };
  }).sort((a, b) => (a.name === 'index' ? -1 : b.name === 'index' ? 1 : a.name.localeCompare(b.name)));

  return (
    <ThemeEditor
      site={{ slug, name: site.name, url: siteUrl(site.slug), role: site.role }}
      theme={{ id: theme.id, name: theme.name, live: s.live_theme_id === theme.id }}
      initialFiles={files} initialUpdatedAt={updatedAt} schemas={schemas} settingsSchema={settingsSchema} templates={templates}
      resources={{
        page: pages.map((p) => ({ value: p.handle, label: p.title })),
        product: products.map((p) => ({ value: p.handle, label: p.title })),
        collection: collections.map((c) => ({ value: c.handle, label: c.title })),
        blog: blogs.map((b) => ({ value: b.handle, label: b.title })),
        article: articles.map((a) => ({ value: `${blogHandle[a.blog_id]}/${a.handle}`, label: a.title })),
        link_list: menus.map((m) => ({ value: m.handle, label: m.title })),
      }}
      // Editor terbuka berjam-jam: token preview berlaku 12 jam, hanya untuk theme ini.
      token={createPreviewToken(site.id, session.userId, 12 * 3600, { t: theme.id })}
    />
  );
}

export default function EditorPage({ params }) {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center text-sm text-muted" aria-busy="true">Memuat editor…</div>}>
      <Editor params={params} />
    </Suspense>
  );
}
