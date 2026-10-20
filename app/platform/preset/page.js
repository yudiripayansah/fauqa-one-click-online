import { Suspense } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, PageHeader, TableSkeleton, inputCls } from '@/components/admin/ui';
import { SubmitButton } from '@/components/admin/client';
import { savePreset } from '../actions';

export const metadata = { title: 'Preset industri' };

async function Presets({ searchParams }) {
  const { key } = await searchParams;
  const supabase = await createClient();
  const { data: list } = await supabase.from('industry_presets').select('key, name, data, updated_at').order('name');
  const cur = list.find((p) => p.key === key) ?? list[0];
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="Preset industri" description="Teks contoh, produk, dan artikel yang diisikan wizard ke situs baru (dan contoh gaya untuk AI). Perubahan tidak mengubah situs yang sudah ada." />
      <nav aria-label="Industri" className="flex flex-wrap gap-1">
        {list.map((p) => (
          <Link key={p.key} href={`/platform/preset?key=${p.key}`} aria-current={p.key === cur?.key ? 'page' : undefined}
            className="rounded-full border border-line px-3 py-1 text-sm text-muted aria-[current=page]:border-accent aria-[current=page]:bg-accent-tint aria-[current=page]:text-accent">{p.name}</Link>
        ))}
      </nav>
      {cur && (
        <Card description={`Terakhir diubah ${new Date(cur.updated_at).toLocaleString('id-ID')}. Wajib ada bagian "id" dan "en" dengan bentuk yang sama.`}>
          <form key={cur.key} action={savePreset} className="space-y-4">
            <input type="hidden" name="key" value={cur.key} />
            <label className="block text-sm font-medium">Nama<input name="name" defaultValue={cur.name} required className={`${inputCls} mt-1.5`} /></label>
            <label className="block text-sm font-medium">Data (JSON)
              <textarea name="data" rows={28} spellCheck={false} defaultValue={JSON.stringify(cur.data, null, 2)} className={`${inputCls} mt-1.5 font-mono text-xs`} />
            </label>
            <SubmitButton>Simpan preset</SubmitButton>
          </form>
        </Card>
      )}
    </div>
  );
}

export default function PresetPage({ searchParams }) {
  return <Suspense fallback={<TableSkeleton />}><Presets searchParams={searchParams} /></Suspense>;
}
