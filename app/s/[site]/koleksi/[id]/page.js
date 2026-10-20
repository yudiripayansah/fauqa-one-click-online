import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { fileRefs } from '@/lib/files';
import { Card, Field, inputCls, inlineInputCls } from '@/components/admin/ui';
import { ConfirmButton } from '@/components/admin/client';
import { FilePicker, RichText, TitleHandle } from '@/components/admin/editors';
import { ContentForm, SeoCard } from '@/components/admin/content';
import { saveCollection, deleteCollection } from '../actions';

export const metadata = { title: 'Koleksi' };

async function Editor({ params }) {
  const { site: slug, id } = await params;
  const { site } = await requireSite(slug);
  const supabase = await createClient();
  const isNew = id === 'baru';
  const [{ data: c }, { data: products }, { data: links }] = await Promise.all([
    isNew ? { data: { rule: 'manual', sort: 'manual' } } : supabase.from('collections').select('*').eq('id', id).eq('site_id', site.id).maybeSingle(),
    supabase.from('products').select('id, title, status, tags').eq('site_id', site.id).order('title'),
    isNew ? { data: [] } : supabase.from('collection_products').select('product_id, position').eq('collection_id', id),
  ]);
  if (!c) notFound();
  const image = await fileRefs(supabase, site.id, c.image ? [c.image] : []);
  const pos = Object.fromEntries(links.map((l) => [l.product_id, l.position]));
  return (
    <ContentForm action={saveCollection} site={slug} id={c.id} back={`/s/${slug}/koleksi`} title={isNew ? 'Tambah koleksi' : c.title}
      footer={!isNew && <ConfirmButton action={deleteCollection} fields={{ site: slug, id: c.id }} title={`Hapus koleksi "${c.title}"?`} message="Produk di dalamnya tidak ikut terhapus.">Hapus</ConfirmButton>}
      aside={<>
        <Card title="Gambar"><FilePicker name="image" site={slug} kind="image" defaultFiles={image} label="Pilih gambar" /></Card>
        <Card title="Urutan">
          <div className="space-y-4">
            <Field label="Urutkan produk" name="sort">
              <select id="sort" name="sort" defaultValue={c.sort} className={inputCls}>
                <option value="manual">Manual</option><option value="title">Nama (A–Z)</option><option value="newest">Terbaru</option>
              </select>
            </Field>
            <Field label="Posisi koleksi" name="position" hint="Angka kecil tampil lebih dulu di daftar koleksi.">
              <input id="position" name="position" type="number" defaultValue={c.position ?? 0} className={inputCls} />
            </Field>
          </div>
        </Card>
        <SeoCard seo={c.seo} />
      </>}>
      <Card>
        <TitleHandle defaultTitle={c.title} defaultHandle={c.handle} prefix="/collections/" />
        <div className="mt-4">
          <span className="block text-sm font-medium">Deskripsi</span>
          <div className="mt-1.5"><RichText name="body" defaultValue={c.body} site={slug} minHeight="min-h-28" /></div>
        </div>
      </Card>
      <Card title="Produk">
        <fieldset className="space-y-3">
          <legend className="sr-only">Cara memilih produk</legend>
          <label className="flex items-start gap-2 text-sm"><input type="radio" name="rule" value="manual" defaultChecked={c.rule === 'manual'} className="mt-1" />
            <span><span className="font-medium">Pilih manual</span><span className="block text-xs text-muted">Centang produk di bawah; angka menentukan urutan.</span></span></label>
          <label className="flex items-start gap-2 text-sm"><input type="radio" name="rule" value="tag" defaultChecked={c.rule === 'tag'} className="mt-1" />
            <span className="flex-1"><span className="font-medium">Otomatis berdasarkan tag</span>
              <input name="rule_tag" defaultValue={c.rule_tag ?? ''} placeholder="mis. atap" aria-label="Tag" className={`${inputCls} mt-1.5 max-w-xs`} /></span></label>
        </fieldset>
        {products.length === 0 ? <p className="mt-4 text-sm text-muted">Belum ada produk.</p> : (
          <ul className="mt-4 max-h-96 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {products.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <input type="checkbox" name="products" value={p.id} defaultChecked={p.id in pos} id={`p-${p.id}`} />
                <label htmlFor={`p-${p.id}`} className="flex-1">{p.title}{p.status === 'draft' && <span className="ml-1 text-xs text-muted">(draft)</span>}</label>
                <input type="number" name={`pos_${p.id}`} defaultValue={pos[p.id] ?? 0} aria-label={`Urutan ${p.title}`} className={`${inlineInputCls} w-20`} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </ContentForm>
  );
}

export default function CollectionEditor({ params }) {
  return <Suspense fallback={<div className="h-96" aria-busy="true" />}><Editor params={params} /></Suspense>;
}
