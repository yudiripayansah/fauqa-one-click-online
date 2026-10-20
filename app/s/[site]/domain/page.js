import { Suspense } from 'react';
import { requireSite } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { PROTOCOL, ROOT_DOMAIN } from '@/lib/hosts';
import { dnsRecords, vercelConfigured } from '@/lib/domains';
import { Card, PageHeader, TableSkeleton, btn, inputCls } from '@/components/admin/ui';
import { ConfirmButton, CopyButton, SubmitButton } from '@/components/admin/client';
import { addDomain, changeSlug, checkNow, removeDomain, setPrimary } from './actions';

export const metadata = { title: 'Domain' };

const STATUS = {
  pending_dns: ['Menunggu DNS', 'bg-line text-muted'],
  verifying: ['Verifikasi', 'bg-line text-muted'],
  active: ['Aktif', 'bg-success/15 text-success'],
  misconfigured: ['DNS bermasalah', 'bg-danger/15 text-danger'],
};

const Hidden = ({ slug, id }) => <><input type="hidden" name="site" value={slug} />{id && <input type="hidden" name="id" value={id} />}</>;

async function Domains({ params }) {
  const { site: slug } = await params;
  const { site } = await requireSite(slug, ['owner', 'admin']);
  const supabase = await createClient();
  const [{ data: row }, { data: domains }, { data: plan }] = await Promise.all([
    supabase.from('sites').select('primary_domain_id, plans (limits)').eq('id', site.id).single(),
    supabase.from('domains').select('id, hostname, status, verification, last_checked_at').eq('site_id', site.id).eq('type', 'custom').order('created_at'),
    supabase.from('domains').select('hostname, verification').eq('site_id', site.id).eq('type', 'platform'),
  ]);
  const limit = row.plans?.limits?.custom_domains ?? 2;
  const primary = domains.find((d) => d.id === row.primary_domain_id && d.status === 'active');
  const platformHost = `${slug}.${ROOT_DOMAIN}`;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Domain" description={<>Alamat utama: <a href={`${PROTOCOL}://${primary?.hostname ?? platformHost}`} target="_blank" rel="noopener" className="font-medium text-ink hover:underline">{primary?.hostname ?? platformHost}</a>. Alamat lain redirect 301 ke sini.</>} />

      <Card title="Subdomain gratis" description="Selalu tersedia. Bila diganti, alamat lama tetap redirect ke alamat baru selama 30 hari.">
        <form action={changeSlug} className="flex flex-wrap items-end gap-3">
          <Hidden slug={slug} />
          <label className="min-w-0 flex-1 text-sm">
            <span className="sr-only">Subdomain</span>
            <span className="flex items-center rounded-lg border border-line bg-surface focus-within:outline-2 focus-within:outline-accent">
              <input name="slug" required defaultValue={slug} pattern="[a-z0-9]([a-z0-9\-]{0,38}[a-z0-9])?" aria-label="Subdomain" className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2 outline-none" />
              <span className="pr-3 text-muted">.{ROOT_DOMAIN}</span>
            </span>
          </label>
          <SubmitButton className={btn.secondary} pendingText="Mengganti…">Ganti alamat</SubmitButton>
        </form>
        {plan?.length > 0 && (
          <p className="mt-3 text-xs text-muted">Masih redirect: {plan.map((p) => `${p.hostname} (sampai ${new Date(p.verification.redirect_until).toLocaleDateString('id-ID')})`).join(', ')}</p>
        )}
      </Card>

      <Card title="Custom domain" description={`Pakai domain sendiri, mis. acme.co.id dan www.acme.co.id. SSL dipasang otomatis. Maksimal ${limit} domain.`}>
        {!vercelConfigured() && <p className="mb-4 rounded-lg bg-accent-tint px-3 py-2 text-sm">Mode development: Vercel belum dikonfigurasi (VERCEL_TOKEN, VERCEL_PROJECT_ID), jadi domain hanya disimpan dan tidak diverifikasi.</p>}
        <ul className="space-y-4">
          {domains.map((d) => {
            const [label, tone] = STATUS[d.status];
            return (
              <li key={d.id} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{d.hostname}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
                    {d.id === primary?.id && <span className="rounded-full bg-accent-tint px-2 py-0.5 text-xs font-semibold text-accent">Utama</span>}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {d.status === 'active' && d.id !== primary?.id && (
                      <form action={setPrimary}><Hidden slug={slug} id={d.id} /><SubmitButton className={btn.secondary} pendingText="Menyimpan…">Jadikan utama</SubmitButton></form>
                    )}
                    {d.id === primary?.id && (
                      <form action={setPrimary}><Hidden slug={slug} /><SubmitButton className={btn.ghost} pendingText="Menyimpan…">Pakai subdomain sebagai utama</SubmitButton></form>
                    )}
                    <form action={checkNow}><Hidden slug={slug} id={d.id} /><SubmitButton className={btn.secondary} pendingText="Mengecek…">Cek sekarang</SubmitButton></form>
                    <ConfirmButton action={removeDomain} className={btn.ghost} fields={{ site: slug, id: d.id }} title={`Hapus ${d.hostname}?`} message="Domain langsung tidak lagi membuka situs ini.">Hapus</ConfirmButton>
                  </div>
                </div>
                {d.status !== 'active' && (
                  <div className="mt-4">
                    <p className="text-sm">Buat record ini di pengelola DNS domain Anda (tempat membeli domain):</p>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="text-xs text-muted"><tr><th className="py-1 pr-4 font-medium">Tipe</th><th className="py-1 pr-4 font-medium">Nama</th><th className="py-1 font-medium">Nilai</th></tr></thead>
                        <tbody>
                          {dnsRecords(d.hostname, d.verification).map((r) => (
                            <tr key={r.type + r.name} className="border-t border-line">
                              <td className="py-2 pr-4 font-mono">{r.type}</td>
                              <td className="py-2 pr-4 font-mono">{r.name}</td>
                              <td className="py-2 font-mono break-all"><span className="mr-2">{r.value}</span><CopyButton text={r.value} className={btn.ghost} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-2 text-xs text-muted">Status dicek otomatis setiap hari; klik &ldquo;Cek sekarang&rdquo; setelah mengubah DNS{d.last_checked_at ? `; terakhir ${new Date(d.last_checked_at).toLocaleString('id-ID')}` : ''}.</p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {domains.length < limit ? (
          <form action={addDomain} className={`flex flex-wrap items-end gap-3 ${domains.length ? 'mt-5' : ''}`}>
            <Hidden slug={slug} />
            <label className="min-w-0 flex-1 text-sm">
              <span className="block font-medium">Tambah domain</span>
              <input name="hostname" required placeholder="acme.co.id" autoCapitalize="none" spellCheck={false} className={`${inputCls} mt-1.5`} />
            </label>
            <SubmitButton pendingText="Menambahkan…">Tambah</SubmitButton>
          </form>
        ) : <p className="mt-4 text-sm text-muted">Batas {limit} custom domain tercapai.</p>}
      </Card>
    </div>
  );
}

export default function DomainPage({ params }) {
  return <Suspense fallback={<TableSkeleton />}><Domains params={params} /></Suspense>;
}
