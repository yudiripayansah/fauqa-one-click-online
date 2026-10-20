import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { Card, PageHeader, TableSkeleton, inputCls } from '@/components/admin/ui';
import { SubmitButton } from '@/components/admin/client';
import { savePlan } from '../actions';

export const metadata = { title: 'Plan & kuota' };

const LIMITS = [['pages', 'Halaman'], ['products', 'Produk'], ['articles', 'Artikel'], ['storage_mb', 'Storage (MB)'], ['themes', 'Theme tersimpan'],
  ['custom_domains', 'Custom domain'], ['members', 'Anggota'], ['locales', 'Bahasa'], ['ai_site_per_day', 'AI situs / hari'], ['ai_text_per_day', 'AI teks / hari']];

async function Plans() {
  const supabase = await createClient();
  const { data } = await supabase.from('plans').select('id, name, limits').order('id');
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Plan & kuota" description="Batas dicek di database saat data ditambah. Mengosongkan isian berarti tanpa batas." />
      {data.map((p) => (
        <Card key={p.id} title={p.name}>
          <form action={savePlan} className="space-y-5">
            <input type="hidden" name="id" value={p.id} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {LIMITS.map(([k, l]) => (
                <label key={k} className="text-sm">{l}<input name={`limit:${k}`} type="number" min={0} defaultValue={p.limits?.[k]} className={`${inputCls} mt-1 tabular-nums`} /></label>
              ))}
            </div>
            <SubmitButton>Simpan</SubmitButton>
          </form>
        </Card>
      ))}
    </div>
  );
}

export default function PlanPage() {
  return <Suspense fallback={<TableSkeleton />}><Plans /></Suspense>;
}
