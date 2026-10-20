import Link from 'next/link';
import { Suspense } from 'react';
import { Brand } from '@/components/admin/AuthShell';
import { ROOT_DOMAIN } from '@/lib/hosts';
import { createClient } from '@/lib/supabase/server';
import { getSession, requireSession, INDUSTRIES } from '@/lib/dal';
import { SubmitButton } from '@/components/admin/client';
import { btn } from '@/components/admin/ui';
import { restoreSite } from '../actions';
import NewSiteForm from './NewSiteForm';

export const metadata = { title: 'Buat website' };

async function Back() {
  const session = await getSession();
  const first = session?.sites[0];
  return first ? <Link href={`/s/${first.slug}`} className="text-sm text-muted hover:text-ink">Batal</Link> : null;
}

// Theme bawaan untuk langkah "Pilih theme": nama + preset gaya dari config theme.
async function loadThemes(supabase) {
  const { data } = await supabase.from('themes').select('builtin_key, name, theme_files (key, content)').is('site_id', null)
    .in('theme_files.key', ['config/settings_data.json']).order('name');
  const order = ['lumen', 'forge', 'aura'];
  return data.map((t) => {
    const presets = JSON.parse(t.theme_files[0]?.content ?? '{}').presets ?? {};
    return { key: t.builtin_key, name: t.name, presets: Object.entries(presets).map(([name, p]) => ({ name, ...p })) };
  }).sort((a, b) => ((order.indexOf(a.key) + 1 || 99) - (order.indexOf(b.key) + 1 || 99)));
}

// Situs yang dihapus < 30 hari bisa dipulihkan owner.
async function deletedSites(userId) {
  const supabase = await createClient();
  const { data } = await supabase.from('site_members').select('sites!inner (id, name, slug, deleted_at)').eq('user_id', userId).eq('role', 'owner')
    .not('sites.deleted_at', 'is', null).gt('sites.deleted_at', new Date(Date.now() - 30 * 864e5).toISOString());
  return data;
}

async function Deleted() {
  const session = await requireSession();
  const data = await deletedSites(session.userId);
  if (!data?.length) return null;
  return (
    <section className="mt-6 rounded-card border border-line bg-surface p-6">
      <h2 className="font-semibold">Situs yang baru dihapus</h2>
      <p className="mt-1 text-sm text-muted">Bisa dipulihkan sampai 30 hari setelah dihapus.</p>
      <ul className="mt-4 divide-y divide-line">
        {data.map(({ sites: s }) => (
          <li key={s.id} className="flex items-center justify-between gap-4 py-3">
            <span><span className="font-medium">{s.name}</span> <span className="text-sm text-muted">{s.slug}.{ROOT_DOMAIN}</span></span>
            <form action={restoreSite}><input type="hidden" name="id" value={s.id} /><SubmitButton className={btn.secondary} pendingText="Memulihkan…">Pulihkan</SubmitButton></form>
          </li>
        ))}
      </ul>
    </section>
  );
}

async function Wizard() {
  await requireSession();
  const themes = await loadThemes(await createClient());
  return <NewSiteForm industries={INDUSTRIES} rootDomain={ROOT_DOMAIN} themes={themes} />;
}

export default function NewSitePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Brand />
        <Suspense><Back /></Suspense>
      </div>
      <Suspense fallback={<div className="h-96 rounded-card border border-line bg-surface" aria-busy="true" />}><Wizard /></Suspense>
      <Suspense><Deleted /></Suspense>
    </main>
  );
}
