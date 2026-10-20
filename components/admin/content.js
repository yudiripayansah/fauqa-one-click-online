// Bagian form konten yang sama di semua modul (server-safe).
import Link from 'next/link';
import { Card, Field, inputCls, btn } from './ui';

import { TIMEZONES, toLocalInput } from '@/lib/tz';

// Kerangka: kolom utama + kolom samping (status, SEO). Header di luar <form> agar tombol Hapus
// (ConfirmButton, punya <form> sendiri) tidak bersarang; tombol Simpan terhubung lewat atribut form.
export function ContentForm({ action, site, id, back, title, children, aside, footer }) {
  return (
    <div className="max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href={back} className={btn.ghost}>← Kembali</Link>
        <h1 className="mr-auto text-2xl font-semibold">{title}</h1>
        {footer}
        <button form="content-form" className={btn.primary}>Simpan</button>
      </div>
      <form id="content-form" action={action}>
        <input type="hidden" name="site" value={site} />
        {id && <input type="hidden" name="id" value={id} />}
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="min-w-0 space-y-6">{children}</div>
          <div className="space-y-6">{aside}</div>
        </div>
      </form>
    </div>
  );
}

export function StatusCard({ status = 'draft', publishedAt, schedule = false, tz }) {
  return (
    <Card title="Status">
      <fieldset className="space-y-2">
        <legend className="sr-only">Status</legend>
        {[['published', 'Terbit', 'Tampil di situs.'], ['draft', 'Draft', 'Hanya terlihat lewat "Lihat situs".']].map(([v, l, h]) => (
          <label key={v} className="flex items-start gap-2 text-sm">
            <input type="radio" name="status" value={v} defaultChecked={status === v} className="mt-1" />
            <span><span className="font-medium">{l}</span><span className="block text-xs text-muted">{h}</span></span>
          </label>
        ))}
      </fieldset>
      {schedule && (
        <Field label="Tanggal terbit" name="published_at" hint={`Zona ${(TIMEZONES.find((t) => t[0] === tz) ?? TIMEZONES[0])[1]}. Isi tanggal mendatang untuk menjadwalkan.`} className="mt-4">
          <input id="published_at" name="published_at" type="datetime-local" defaultValue={toLocalInput(publishedAt, tz)} className={inputCls} />
        </Field>
      )}
    </Card>
  );
}

export function SeoCard({ seo = {}, hint }) {
  return (
    <Card title="SEO" description={hint ?? 'Kosongkan untuk memakai judul & ringkasan.'}>
      <div className="space-y-4">
        <Field label="Judul SEO" name="seo_title"><input id="seo_title" name="seo_title" maxLength={120} defaultValue={seo.title} className={inputCls} /></Field>
        <Field label="Deskripsi SEO" name="seo_description"><textarea id="seo_description" name="seo_description" rows={3} maxLength={320} defaultValue={seo.description} className={inputCls} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="seo_noindex" defaultChecked={seo.noindex} /> Sembunyikan dari mesin pencari</label>
      </div>
    </Card>
  );
}

// Template alternatif dari theme live (templates/<type>.<suffix>.json).
export function TemplateCard({ suffixes, value, type }) {
  if (!suffixes.length) return null;
  return (
    <Card title="Template">
      <select name="template_suffix" defaultValue={value ?? ''} aria-label="Template" className={inputCls}>
        <option value="">Default ({type})</option>
        {suffixes.map((s) => <option key={s} value={s}>{type}.{s}</option>)}
      </select>
    </Card>
  );
}

export function StatusBadge({ status }) {
  return status === 'published'
    ? <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">Terbit</span>
    : <span className="rounded-full bg-line px-2 py-0.5 text-xs font-semibold text-muted">Draft</span>;
}
