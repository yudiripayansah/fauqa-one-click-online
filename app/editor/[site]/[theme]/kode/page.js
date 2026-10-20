// Edit kode theme (PRD §4.4). Owner/admin saja; layar penuh.
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import CodeEditor from '@/components/editor/CodeEditor';

export const metadata = { title: 'Edit kode theme' };

async function Code({ params, searchParams }) {
  const [{ site: slug, theme: themeId }, { file }] = await Promise.all([params, searchParams]);
  const { site } = await requireSite(slug, ['owner', 'admin']);
  const supabase = await createClient();
  const [{ data: theme }, { data: files }] = await Promise.all([
    supabase.from('themes').select('id, name').eq('id', themeId).eq('site_id', site.id).maybeSingle(),
    supabase.from('theme_files').select('key, size, storage_path').eq('theme_id', themeId).order('key'),
  ]);
  if (!theme) notFound();
  return (
    <CodeEditor site={slug} theme={theme} initialFiles={files.map((f) => ({ key: f.key, size: f.size, binary: !!f.storage_path }))}
      initialKey={files.some((f) => f.key === file) ? file : 'layout/theme.liquid'} />
  );
}

export default function CodePage({ params, searchParams }) {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center text-sm text-muted" aria-busy="true">Memuat editor kode…</div>}>
      <Code params={params} searchParams={searchParams} />
    </Suspense>
  );
}
