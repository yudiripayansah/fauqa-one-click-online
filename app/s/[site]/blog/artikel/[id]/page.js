import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { fileRefs } from '@/lib/files';
import { Card, Field, inputCls } from '@/components/admin/ui';
import { ConfirmButton } from '@/components/admin/client';
import { FilePicker, RichText, TitleHandle } from '@/components/admin/editors';
import { ContentForm, SeoCard, StatusCard } from '@/components/admin/content';
import { saveArticle, deleteArticle } from '../../actions';

export const metadata = { title: 'Artikel' };

async function Editor({ params, searchParams }) {
  const [{ site: slug, id }, { blog: blogParam }] = await Promise.all([params, searchParams]);
  const { site, session } = await requireSite(slug);
  const supabase = await createClient();
  const isNew = id === 'baru';
  const [{ data: a }, { data: blogs }] = await Promise.all([
    isNew ? { data: { tags: [], author: session.name, blog_id: blogParam } } : supabase.from('articles').select('*').eq('id', id).eq('site_id', site.id).maybeSingle(),
    supabase.from('blogs').select('id, title, handle').eq('site_id', site.id).order('title'),
  ]);
  if (!a) notFound();
  const cover = await fileRefs(supabase, site.id, a.cover ? [a.cover] : []);
  return (
    <ContentForm action={saveArticle} site={slug} id={a.id} back={`/s/${slug}/blog`} title={isNew ? 'Tulis artikel' : a.title}
      footer={!isNew && <ConfirmButton action={deleteArticle} fields={{ site: slug, id: a.id }} title={`Hapus "${a.title}"?`}>Hapus</ConfirmButton>}
      aside={<>
        <StatusCard status={a.status} publishedAt={a.published_at} schedule tz={site.timezone} />
        <Card title="Detail">
          <div className="space-y-4">
            <Field label="Blog" name="blog_id">
              <select id="blog_id" name="blog_id" required defaultValue={a.blog_id ?? blogs[0]?.id} className={inputCls}>
                {blogs.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
            </Field>
            <Field label="Penulis" name="author"><input id="author" name="author" defaultValue={a.author} className={inputCls} /></Field>
            <Field label="Tag" name="tags" hint="Pisahkan dengan koma."><input id="tags" name="tags" defaultValue={a.tags.join(', ')} className={inputCls} /></Field>
          </div>
        </Card>
        <Card title="Gambar sampul"><FilePicker name="cover" site={slug} kind="image" defaultFiles={cover} label="Pilih gambar" /></Card>
        <SeoCard seo={a.seo} />
      </>}>
      <Card>
        <TitleHandle defaultTitle={a.title} defaultHandle={a.handle} prefix={`/blogs/${blogs.find((b) => b.id === a.blog_id)?.handle ?? blogs[0]?.handle ?? 'blog'}/`} />
        <Field label="Ringkasan" name="excerpt" hint="Tampil di daftar artikel & mesin pencari." className="mt-4">
          <textarea id="excerpt" name="excerpt" rows={2} maxLength={500} defaultValue={a.excerpt} className={inputCls} />
        </Field>
        <div className="mt-4">
          <span className="block text-sm font-medium">Isi</span>
          <div className="mt-1.5"><RichText name="body" defaultValue={a.body} site={slug} minHeight="min-h-96" /></div>
        </div>
      </Card>
    </ContentForm>
  );
}

export default function ArticleEditor({ params, searchParams }) {
  return <Suspense fallback={<div className="h-96" aria-busy="true" />}><Editor params={params} searchParams={searchParams} /></Suspense>;
}
