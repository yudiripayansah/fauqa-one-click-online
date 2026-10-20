import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { templateSuffixes } from '@/lib/content';
import { fileRefs } from '@/lib/files';
import { Card, Field, inputCls } from '@/components/admin/ui';
import { ConfirmButton } from '@/components/admin/client';
import { FilePicker, PairsEditor, RichText, TitleHandle } from '@/components/admin/editors';
import { ContentForm, SeoCard, StatusCard, TemplateCard } from '@/components/admin/content';
import { saveProduct, deleteProduct } from '../actions';

export const metadata = { title: 'Produk' };

async function Editor({ params }) {
  const { site: slug, id } = await params;
  const { site } = await requireSite(slug);
  const supabase = await createClient();
  const isNew = id === 'baru';
  const [{ data: p }, suffixes, { data: collections }, { data: others }, { data: links }] = await Promise.all([
    isNew ? { data: { media: [], downloads: [], specs: [], tags: [], related_ids: [], cta: { type: 'inquiry' } } } : supabase.from('products').select('*').eq('id', id).eq('site_id', site.id).maybeSingle(),
    templateSuffixes(supabase, site.id, 'product'),
    supabase.from('collections').select('id, title, rule, rule_tag').eq('site_id', site.id).order('title'),
    supabase.from('products').select('id, title').eq('site_id', site.id).neq('id', isNew ? '00000000-0000-0000-0000-000000000000' : id).order('title'),
    isNew ? { data: [] } : supabase.from('collection_products').select('collection_id').eq('product_id', id),
  ]);
  if (!p) notFound();
  const [media, downloads] = await Promise.all([fileRefs(supabase, site.id, p.media), fileRefs(supabase, site.id, p.downloads)]);
  const inCol = new Set(links.map((l) => l.collection_id));
  return (
    <ContentForm action={saveProduct} site={slug} id={p.id} back={`/s/${slug}/produk`} title={isNew ? 'Tambah produk' : p.title}
      footer={!isNew && <ConfirmButton action={deleteProduct} fields={{ site: slug, id: p.id }} title={`Hapus "${p.title}"?`} message="Produk langsung hilang dari situs dan koleksi.">Hapus</ConfirmButton>}
      aside={<>
        <StatusCard status={p.status} />
        <Card title="Organisasi">
          <div className="space-y-4">
            <Field label="Tag" name="tags" hint="Pisahkan dengan koma. Dipakai koleksi otomatis.">
              <input id="tags" name="tags" defaultValue={p.tags.join(', ')} className={inputCls} />
            </Field>
            {collections.length > 0 && (
              <fieldset>
                <legend className="text-sm font-medium">Koleksi</legend>
                <div className="mt-1.5 max-h-48 space-y-1.5 overflow-y-auto">
                  {collections.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="collections" value={c.id} defaultChecked={inCol.has(c.id)} disabled={c.rule === 'tag'} />
                      {c.title}{c.rule === 'tag' && <span className="text-xs text-muted">(otomatis: tag &quot;{c.rule_tag}&quot;)</span>}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <Field label="Urutan" name="position" hint="Angka kecil tampil lebih dulu.">
              <input id="position" name="position" type="number" defaultValue={p.position ?? 0} className={inputCls} />
            </Field>
          </div>
        </Card>
        {others.length > 0 && (
          <Card title="Produk terkait">
            <select name="related" multiple defaultValue={p.related_ids} aria-label="Produk terkait" className={`${inputCls} h-40`}>
              {others.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
            </select>
            <p className="mt-1.5 text-xs text-muted">Tahan Ctrl/⌘ untuk memilih beberapa.</p>
          </Card>
        )}
        <TemplateCard suffixes={suffixes} value={p.template_suffix} type="product" />
        <SeoCard seo={p.seo} />
      </>}>
      <Card>
        <TitleHandle defaultTitle={p.title} defaultHandle={p.handle} prefix="/products/" titleLabel="Nama produk / layanan" />
        <Field label="Ringkasan" name="summary" hint="1–2 kalimat untuk kartu produk & mesin pencari." className="mt-4">
          <textarea id="summary" name="summary" rows={2} maxLength={500} defaultValue={p.summary} className={inputCls} />
        </Field>
        <div className="mt-4">
          <span className="block text-sm font-medium">Deskripsi</span>
          <div className="mt-1.5"><RichText name="body" defaultValue={p.body} site={slug} /></div>
        </div>
      </Card>
      <Card title="Galeri" description="Gambar pertama menjadi gambar utama.">
        <FilePicker name="media" site={slug} kind="image" multiple defaultFiles={media} label="Tambah gambar" />
      </Card>
      <Card title="Spesifikasi" description="Contoh: Tebal — 0,75 mm.">
        <PairsEditor name="specs" defaultValue={p.specs} labels={['Label', 'Nilai']} />
      </Card>
      <Card title="Harga & tombol">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Harga tampil" name="price_label" hint='Teks bebas, mis. "Mulai Rp 5 jt" atau "Hubungi kami".'>
            <input id="price_label" name="price_label" maxLength={80} defaultValue={p.price_label} className={inputCls} />
          </Field>
          <Field label="Tombol" name="cta_type">
            <select id="cta_type" name="cta_type" defaultValue={p.cta?.type} className={inputCls}>
              <option value="inquiry">Form minta penawaran</option>
              <option value="whatsapp">WhatsApp (nomor di pengaturan kontak)</option>
              <option value="link">Link</option>
            </select>
          </Field>
          <Field label="Teks tombol" name="cta_label" hint="Kosongkan untuk teks bawaan.">
            <input id="cta_label" name="cta_label" maxLength={60} defaultValue={p.cta?.label} className={inputCls} />
          </Field>
          <Field label="Link tombol" name="cta_url" hint="Hanya untuk tombol tipe Link.">
            <input id="cta_url" name="cta_url" defaultValue={p.cta?.url} placeholder="https://" className={inputCls} />
          </Field>
        </div>
      </Card>
      <Card title="Unduhan" description="Brosur, katalog, atau datasheet.">
        <FilePicker name="downloads" site={slug} multiple defaultFiles={downloads} label="Tambah file" />
      </Card>
    </ContentForm>
  );
}

export default function ProductEditor({ params }) {
  return <Suspense fallback={<div className="h-96" aria-busy="true" />}><Editor params={params} /></Suspense>;
}
