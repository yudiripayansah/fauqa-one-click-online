import { Suspense } from 'react';
import Link from 'next/link';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { Card, PageHeader, EmptyState, TableSkeleton, btn, inlineInputCls, td, th } from '@/components/admin/ui';
import { ConfirmButton, SubmitButton } from '@/components/admin/client';
import { StatusBadge } from '@/components/admin/content';
import { saveBlog, deleteBlog } from './actions';

export const metadata = { title: 'Blog' };

const fmt = (d) => (d ? new Intl.DateTimeFormat('id', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' }).format(new Date(d)) : '—');

async function List({ params, searchParams }) {
  const [{ site: slug }, { blog: blogFilter }] = await Promise.all([params, searchParams]);
  const { site } = await requireSite(slug);
  const supabase = await createClient();
  const [{ data: blogs }, { data: articles }] = await Promise.all([
    supabase.from('blogs').select('id, title, handle').eq('site_id', site.id).order('title'),
    (() => {
      const q = supabase.from('articles').select('id, title, status, published_at, blog_id').eq('site_id', site.id).order('published_at', { ascending: false, nullsFirst: true });
      return blogFilter ? q.eq('blog_id', blogFilter) : q;
    })(),
  ]);
  const blogName = Object.fromEntries(blogs.map((b) => [b.id, b.title]));
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Blog" description="Berita dan artikel perusahaan."
        action={blogs.length > 0 && <Link href={`/s/${slug}/blog/artikel/baru${blogFilter ? `?blog=${blogFilter}` : ''}`} className={btn.primary}>Tulis artikel</Link>} />

      <Card title="Blog" description="Satu situs bisa punya beberapa blog, mis. Berita dan Artikel.">
        <ul className="divide-y divide-line">
          {blogs.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-2 py-2">
              <form action={saveBlog} className="flex flex-1 flex-wrap items-center gap-2">
                <input type="hidden" name="site" value={slug} /><input type="hidden" name="id" value={b.id} />
                <input name="title" defaultValue={b.title} aria-label="Nama blog" className={inlineInputCls} />
                <span className="text-sm text-muted">/blogs/</span>
                <input name="handle" defaultValue={b.handle} aria-label="URL blog" className={`${inlineInputCls} w-32`} />
                <SubmitButton className={btn.ghost}>Simpan</SubmitButton>
              </form>
              <ConfirmButton action={deleteBlog} fields={{ site: slug, id: b.id }} className={btn.ghost} title={`Hapus blog "${b.title}"?`} message="Semua artikel di blog ini ikut terhapus.">Hapus</ConfirmButton>
            </li>
          ))}
        </ul>
        <form action={saveBlog} className="mt-3 flex gap-2">
          <input type="hidden" name="site" value={slug} />
          <input name="title" required placeholder="Nama blog baru" aria-label="Nama blog baru" className={inlineInputCls} />
          <SubmitButton className={btn.secondary}>Tambah blog</SubmitButton>
        </form>
      </Card>

      {blogs.length > 1 && (
        <nav aria-label="Filter blog" className="flex flex-wrap gap-1">
          {[{ id: '', title: 'Semua' }, ...blogs].map((b) => (
            <Link key={b.id} href={`/s/${slug}/blog${b.id ? `?blog=${b.id}` : ''}`} aria-current={(blogFilter ?? '') === b.id ? 'page' : undefined}
              className="rounded-full border border-line px-3 py-1 text-sm text-muted aria-[current=page]:border-accent aria-[current=page]:bg-accent-tint aria-[current=page]:text-accent">{b.title}</Link>
          ))}
        </nav>
      )}
      {articles.length === 0 ? <EmptyState title="Belum ada artikel" actionHref={blogs.length ? `/s/${slug}/blog/artikel/baru` : undefined} actionLabel="Tulis artikel" /> : (
        <div className="overflow-x-auto rounded-card border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line"><tr><th className={th}>Judul</th><th className={th}>Blog</th><th className={th}>Terbit</th><th className={th}>Status</th></tr></thead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0 hover:bg-line/30">
                  <td className={td}><Link href={`/s/${slug}/blog/artikel/${a.id}`} className="font-medium hover:text-accent">{a.title}</Link></td>
                  <td className={`${td} text-muted`}>{blogName[a.blog_id]}</td>
                  <td className={`${td} text-muted`}>{fmt(a.published_at)}{a.status === 'published' && new Date(a.published_at) > new Date() && ' (terjadwal)'}</td>
                  <td className={td}><StatusBadge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function BlogPage({ params, searchParams }) {
  return <Suspense fallback={<TableSkeleton />}><List params={params} searchParams={searchParams} /></Suspense>;
}
