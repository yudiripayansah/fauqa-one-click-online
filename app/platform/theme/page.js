import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader, TableSkeleton, btn } from '@/components/admin/ui';
import { SubmitButton } from '@/components/admin/client';
import { uploadBuiltin } from '../actions';

export const metadata = { title: 'Theme bawaan' };

async function Themes() {
  const supabase = await createClient();
  const { data } = await supabase.from('themes').select('id, name, builtin_key, builtin_version, updated_at').is('site_id', null).order('name');
  const { data: usage } = await supabase.from('themes').select('builtin_key').not('site_id', 'is', null);
  const used = (usage ?? []).reduce((m, t) => ({ ...m, [t.builtin_key]: (m[t.builtin_key] ?? 0) + 1 }), {});
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Theme bawaan" description="Unggah .zip versi baru (divalidasi seperti upload theme situs). Hanya situs baru dan theme yang ditambahkan setelahnya yang memakai versi baru." />
      <ul className="divide-y divide-line rounded-card border border-line bg-surface">
        {data.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span><span className="font-medium">{t.name}</span> <span className="text-sm text-muted">v{t.builtin_version} · dipakai {used[t.builtin_key] ?? 0} salinan · <a href={`/platform/theme/${t.builtin_key}/unduh`} className="hover:text-ink">unduh .zip</a></span></span>
            <form action={uploadBuiltin} className="flex items-center gap-2">
              <input type="hidden" name="key" value={t.builtin_key} />
              <input type="file" name="file" accept=".zip" required aria-label={`File .zip ${t.name}`} className="max-w-52 text-sm" />
              <SubmitButton className={btn.secondary} pendingText="Mengunggah…">Terbitkan</SubmitButton>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ThemePage() {
  return <Suspense fallback={<TableSkeleton />}><Themes /></Suspense>;
}
