import { Suspense } from 'react';
import Link from 'next/link';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { Card, PageHeader, TableSkeleton, btn, inputCls } from '@/components/admin/ui';
import { ConfirmButton, SubmitButton } from '@/components/admin/client';
import { saveMenu, deleteMenu } from './actions';
import MenuEditor from './MenuEditor';

export const metadata = { title: 'Menu' };

async function Menus({ params, searchParams }) {
  const [{ site: slug }, { menu: menuId }] = await Promise.all([params, searchParams]);
  const { site } = await requireSite(slug);
  const supabase = await createClient();
  const [{ data: menus }, { data: pages }, { data: products }, { data: collections }, { data: blogs }] = await Promise.all([
    supabase.from('menus').select('id, handle, title, items').eq('site_id', site.id).order('handle'),
    supabase.from('pages').select('title, handle').eq('site_id', site.id).order('title'),
    supabase.from('products').select('title, handle').eq('site_id', site.id).order('title').limit(200),
    supabase.from('collections').select('title, handle').eq('site_id', site.id).order('title'),
    supabase.from('blogs').select('title, handle').eq('site_id', site.id).order('title'),
  ]);
  const links = [
    { group: 'Umum', title: 'Beranda', url: '/' }, { group: 'Umum', title: 'Semua produk', url: '/collections/all' },
    { group: 'Umum', title: 'Daftar koleksi', url: '/collections' }, { group: 'Umum', title: 'Pencarian', url: '/search' },
    ...pages.map((p) => ({ group: 'Halaman', title: p.title, url: `/pages/${p.handle}` })),
    ...collections.map((c) => ({ group: 'Koleksi', title: c.title, url: `/collections/${c.handle}` })),
    ...blogs.map((b) => ({ group: 'Blog', title: b.title, url: `/blogs/${b.handle}` })),
    ...products.map((p) => ({ group: 'Produk', title: p.title, url: `/products/${p.handle}` })),
  ];
  menus.sort((a, b) => (b.handle === 'main-menu') - (a.handle === 'main-menu'));
  const current = menus.find((m) => m.id === menuId) ?? menus[0];
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Menu navigasi" description="Menu header & footer. Theme memanggilnya lewat linklists['handle']." />
      <div className="grid gap-6 md:grid-cols-[14rem_1fr]">
        <div className="space-y-3">
          <nav aria-label="Daftar menu" className="space-y-1">
            {menus.map((m) => (
              <Link key={m.id} href={`/s/${slug}/menu?menu=${m.id}`} aria-current={m.id === current?.id ? 'page' : undefined}
                className="block rounded-lg px-3 py-2 text-sm hover:bg-line/40 aria-[current=page]:bg-accent-tint aria-[current=page]:font-semibold aria-[current=page]:text-accent">
                {m.title}<span className="block text-xs font-normal text-muted">{m.handle}</span>
              </Link>
            ))}
          </nav>
          <form action={saveMenu} className="space-y-2 rounded-card border border-line bg-surface p-3">
            <input type="hidden" name="site" value={slug} />
            <input name="title" required placeholder="Nama menu baru" aria-label="Nama menu baru" className={inputCls} />
            <SubmitButton className={`${btn.secondary} w-full`}>Tambah menu</SubmitButton>
          </form>
        </div>
        {current && (
          <Card>
            <form action={saveMenu} className="space-y-4">
              <input type="hidden" name="site" value={slug} /><input type="hidden" name="id" value={current.id} />
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1">
                  <label htmlFor="menu-title" className="block text-sm font-medium">Nama menu</label>
                  <input id="menu-title" name="title" defaultValue={current.title} className={`${inputCls} mt-1.5`} />
                </div>
                <p className="pb-2 text-sm text-muted">Handle: <code>{current.handle}</code></p>
              </div>
              <MenuEditor key={current.id} defaultItems={current.items} links={links} />
              <div className="flex justify-between border-t border-line pt-4">
                <SubmitButton>Simpan menu</SubmitButton>
              </div>
            </form>
            {!['main-menu', 'footer'].includes(current.handle) && (
              <div className="mt-2 text-right">
                <ConfirmButton action={deleteMenu} fields={{ site: slug, id: current.id }} className={btn.ghost} title={`Hapus menu "${current.title}"?`}>Hapus menu</ConfirmButton>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

export default function MenuPage({ params, searchParams }) {
  return <Suspense fallback={<TableSkeleton />}><Menus params={params} searchParams={searchParams} /></Suspense>;
}
