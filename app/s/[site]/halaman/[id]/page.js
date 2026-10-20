import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { templateSuffixes } from '@/lib/content';
import { Card } from '@/components/admin/ui';
import { ConfirmButton } from '@/components/admin/client';
import { RichText, TitleHandle } from '@/components/admin/editors';
import { ContentForm, SeoCard, StatusCard, TemplateCard } from '@/components/admin/content';
import { savePage, deletePage } from '../actions';

export const metadata = { title: 'Halaman' };

async function Editor({ params }) {
  const { site: slug, id } = await params;
  const { site } = await requireSite(slug);
  const supabase = await createClient();
  const isNew = id === 'baru';
  const [{ data: page }, suffixes] = await Promise.all([
    isNew ? { data: {} } : supabase.from('pages').select('*').eq('id', id).eq('site_id', site.id).maybeSingle(),
    templateSuffixes(supabase, site.id, 'page'),
  ]);
  if (!page) notFound();
  return (
    <ContentForm action={savePage} site={slug} id={page.id} back={`/s/${slug}/halaman`} title={isNew ? 'Tambah halaman' : page.title}
      footer={!isNew && <ConfirmButton action={deletePage} fields={{ site: slug, id: page.id }} title={`Hapus "${page.title}"?`} message="Halaman langsung hilang dari situs.">Hapus</ConfirmButton>}
      aside={<>
        <StatusCard status={page.status} publishedAt={page.published_at} schedule tz={site.timezone} />
        <TemplateCard suffixes={suffixes} value={page.template_suffix} type="page" />
        <SeoCard seo={page.seo} />
      </>}>
      <Card>
        <TitleHandle defaultTitle={page.title} defaultHandle={page.handle} prefix="/pages/" />
        <div className="mt-4">
          <span className="block text-sm font-medium" id="body-label">Isi</span>
          <div className="mt-1.5"><RichText name="body" defaultValue={page.body} site={slug} minHeight="min-h-72" /></div>
        </div>
      </Card>
    </ContentForm>
  );
}

export default function PageEditor({ params }) {
  return <Suspense fallback={<div className="h-96" aria-busy="true" />}><Editor params={params} /></Suspense>;
}
