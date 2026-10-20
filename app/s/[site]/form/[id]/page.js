import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSite, FORM_TYPE } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { Card, Field, btn, inputCls } from '@/components/admin/ui';
import { ConfirmButton, SubmitButton } from '@/components/admin/client';
import { updateSubmission, deleteSubmission } from '../actions';

export const metadata = { title: 'Kiriman form' };

const LABEL = { name: 'Nama', email: 'Email', phone: 'Telepon', body: 'Pesan' };
const STATUS = [['new', 'Baru'], ['read', 'Dibaca'], ['done', 'Selesai'], ['spam', 'Spam']];

async function Detail({ params }) {
  const { site: slug, id } = await params;
  const { site } = await requireSite(slug);
  const supabase = await createClient();
  const { data: r } = await supabase.from('form_submissions').select('*, products (title)').eq('id', id).eq('site_id', site.id).maybeSingle();
  if (!r) notFound();
  if (r.status === 'new') await supabase.from('form_submissions').update({ status: 'read' }).eq('id', id); // dibuka = dibaca
  const status = r.status === 'new' ? 'read' : r.status;
  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/s/${slug}/form`} className={btn.ghost}>← Kembali</Link>
        <h1 className="mr-auto text-2xl font-semibold">{r.fields.name || r.fields.email || 'Kiriman form'}</h1>
        {r.fields.email && <a href={`mailto:${r.fields.email}`} className={btn.primary}>Balas email</a>}
      </div>
      <Card>
        <p className="text-sm text-muted">{FORM_TYPE[r.form_type]}{r.products?.title && ` · ${r.products.title}`} · {new Intl.DateTimeFormat('id', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(r.created_at))}{r.page_path && ` · dari ${r.page_path}`}</p>
        <dl className="mt-4 space-y-3">
          {Object.entries(r.fields).map(([k, v]) => (
            <div key={k}><dt className="text-sm text-muted">{LABEL[k] ?? k}</dt><dd className="whitespace-pre-wrap break-words">{String(v)}</dd></div>
          ))}
        </dl>
      </Card>
      <Card title="Tindak lanjut">
        <form action={updateSubmission} className="space-y-4">
          <input type="hidden" name="site" value={slug} /><input type="hidden" name="id" value={r.id} />
          <fieldset className="flex flex-wrap gap-4">
            <legend className="mb-1.5 text-sm font-medium">Status</legend>
            {STATUS.map(([v, l]) => <label key={v} className="flex items-center gap-1.5 text-sm"><input type="radio" name="status" value={v} defaultChecked={status === v} /> {l}</label>)}
          </fieldset>
          <Field label="Catatan internal" name="note" hint="Hanya terlihat anggota situs.">
            <textarea id="note" name="note" rows={3} defaultValue={r.note} className={inputCls} />
          </Field>
          <SubmitButton>Simpan</SubmitButton>
        </form>
        <div className="mt-2 text-right">
          <ConfirmButton action={deleteSubmission} fields={{ site: slug, id: r.id }} title="Hapus kiriman ini?" className={btn.ghost}>Hapus kiriman</ConfirmButton>
        </div>
      </Card>
    </div>
  );
}

export default function SubmissionPage({ params }) {
  return <Suspense fallback={<div className="h-96" aria-busy="true" />}><Detail params={params} /></Suspense>;
}
