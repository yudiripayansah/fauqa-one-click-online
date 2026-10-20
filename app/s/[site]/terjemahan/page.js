import { Suspense } from 'react';
import Link from 'next/link';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { loadCatalog, withBody } from '@/lib/translate';
import { Card, EmptyState, PageHeader, TableSkeleton, inputCls } from '@/components/admin/ui';
import { SubmitButton } from '@/components/admin/client';
import { RichText } from '@/components/admin/editors';
import { saveTranslation } from './actions';

export const metadata = { title: 'Terjemahan' };

const LANG = { id: 'Bahasa Indonesia', en: 'English' };
const plain = (html) => String(html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

async function Translations({ params, searchParams }) {
  const [{ site: slug }, { r }] = await Promise.all([params, searchParams]);
  const { site } = await requireSite(slug);
  const supabase = await createClient();
  const { data: s } = await supabase.from('sites').select('default_locale, locales').eq('id', site.id).single();
  const locale = s.locales.find((l) => l !== s.default_locale);
  if (!locale) {
    return <EmptyState title="Situs ini baru satu bahasa" description="Aktifkan bahasa kedua di Pengaturan → Bahasa, lalu terjemahkan konten di sini." actionHref={`/s/${slug}/pengaturan?tab=bahasa`} actionLabel="Buka pengaturan bahasa" />;
  }
  let [catalog, { data: rows }] = await Promise.all([
    loadCatalog(supabase, site.id),
    supabase.from('translations').select('resource_type, resource_key, field, value').eq('site_id', site.id).eq('locale', locale),
  ]);
  catalog = catalog.map(([group, list]) => [group, list.filter((it) => it.fields.length)]);
  const done = new Map((rows ?? []).map((t) => [`${t.resource_type}:${t.resource_key}:${t.field}`, t.value]));
  const items = catalog.flatMap(([, list]) => list);
  const current = items.find((it) => it.id === r) ?? items[0];
  const item = current && (await withBody(supabase, current));
  const progress = (it) => [it.fields.filter((f) => done.has(`${it.type}:${it.key}:${f.field}`)).length, it.fields.length];

  return (
    <div className="space-y-6">
      <PageHeader title="Terjemahan" description={`${LANG[s.default_locale]} → ${LANG[locale]}. Teks yang belum diterjemahkan tampil dalam ${LANG[s.default_locale]} di /${locale}/….`} />
      <div className="grid items-start gap-6 lg:grid-cols-[17rem_1fr]">
        <nav aria-label="Konten yang bisa diterjemahkan" className="rounded-card border border-line bg-surface p-3 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto">
          {catalog.filter(([, list]) => list.length).map(([group, list]) => (
            <div key={group} className="mb-3 last:mb-0">
              <p className="px-2 py-1 text-xs font-semibold text-muted">{group}</p>
              <ul>
                {list.map((it) => {
                  const [n, total] = progress(it);
                  return (
                    <li key={it.id}>
                      <Link href={`/s/${slug}/terjemahan?r=${encodeURIComponent(it.id)}`} aria-current={it.id === item?.id ? 'page' : undefined}
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-line/50 aria-[current=page]:bg-accent-tint aria-[current=page]:text-accent">
                        <span className="truncate">{it.label}</span>
                        <span className={`shrink-0 text-xs ${n === total && total ? 'text-success' : 'text-muted'}`}>{n}/{total}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {item && (
          <Card title={item.label} description={item.type === 'theme' ? `Teks section di ${item.file}. Hanya theme yang sedang tayang.` : null}>
            {item.fields.length === 0 ? <p className="text-sm text-muted">Tidak ada teks untuk diterjemahkan.</p> : (
              <form key={item.id} action={saveTranslation} className="space-y-6">
                <input type="hidden" name="site" value={slug} />
                <input type="hidden" name="r" value={item.id} />
                {item.fields.map((f) => {
                  const name = `t:${f.field}`;
                  const value = done.get(`${item.type}:${item.key}:${f.field}`) ?? '';
                  return (
                    <div key={f.field} className="grid gap-2 md:grid-cols-2 md:gap-4">
                      <div>
                        <label htmlFor={name} className="block text-sm font-medium">{f.label}</label>
                        <p className="mt-1.5 max-h-40 overflow-y-auto rounded-lg bg-bg px-3 py-2 text-sm whitespace-pre-line text-muted">{f.kind === 'richtext' ? plain(f.source) : f.source}</p>
                      </div>
                      <div className="md:pt-6">
                        {f.kind === 'richtext'
                          ? <RichText name={name} id={name} defaultValue={value} site={slug} minHeight="min-h-32" />
                          : f.kind === 'textarea'
                            ? <textarea id={name} name={name} rows={3} defaultValue={value} placeholder={LANG[locale]} className={inputCls} />
                            : <input id={name} name={name} defaultValue={value} placeholder={LANG[locale]} className={inputCls} />}
                      </div>
                    </div>
                  );
                })}
                <SubmitButton>Simpan terjemahan</SubmitButton>
              </form>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

export default function TranslationsPage({ params, searchParams }) {
  return <Suspense fallback={<TableSkeleton />}><Translations params={params} searchParams={searchParams} /></Suspense>;
}
