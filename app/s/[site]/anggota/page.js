import { Suspense } from 'react';
import { requireSite, ROLE_LABEL } from '@/lib/dal';
import { createClient } from '@/lib/supabase/server';
import { APP_URL } from '@/lib/hosts';
import { Card, PageHeader, TableSkeleton, btn, inlineInputCls, td, th } from '@/components/admin/ui';
import { ConfirmButton, CopyButton, SubmitButton } from '@/components/admin/client';
import { changeRole, removeMember, revokeInvite } from './actions';
import InviteForm from './InviteForm';

export const metadata = { title: 'Anggota' };

const ROLE_HINT = {
  owner: 'Semua akses, termasuk hapus situs.',
  admin: 'Semua akses kecuali hapus situs.',
  editor: 'Konten & tampilan visual, tanpa kode, domain, dan anggota.',
};

async function Members({ params }) {
  const { site: slug } = await params;
  const { session, site } = await requireSite(slug);
  const manage = ['owner', 'admin'].includes(site.role);
  const supabase = await createClient();
  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from('site_members').select('user_id, role, created_at').eq('site_id', site.id).order('created_at'),
    manage ? supabase.from('site_invites').select('id, email, role, token, expires_at').eq('site_id', site.id).is('accepted_at', null).order('created_at') : { data: [] },
  ]);
  const { data: profiles } = await supabase.from('profiles').select('user_id, name, email').in('user_id', members.map((m) => m.user_id));
  const byId = Object.fromEntries(profiles.map((p) => [p.user_id, p]));

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Anggota" description="Orang yang bisa mengelola situs ini. Maksimal 5 anggota." />
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-line"><tr><th className={th}>Nama</th><th className={th}>Peran</th><th className={th}><span className="sr-only">Aksi</span></th></tr></thead>
          <tbody>
            {members.map((m) => {
              const p = byId[m.user_id] ?? {};
              const editable = manage && m.role !== 'owner' && m.user_id !== session.userId;
              return (
                <tr key={m.user_id} className="border-b border-line last:border-0">
                  <td className={td}>
                    <p className="font-medium">{p.name || '—'}{m.user_id === session.userId && <span className="text-muted"> (Anda)</span>}</p>
                    <p className="text-xs text-muted">{p.email}</p>
                  </td>
                  <td className={td}>
                    {editable ? (
                      <form action={changeRole} className="flex items-center gap-2">
                        <input type="hidden" name="site" value={slug} />
                        <input type="hidden" name="user" value={m.user_id} />
                        <select name="role" defaultValue={m.role} aria-label={`Peran ${p.name}`} className={inlineInputCls}>
                          <option value="editor">Editor</option><option value="admin">Admin</option>
                        </select>
                        <SubmitButton className={btn.ghost}>Simpan</SubmitButton>
                      </form>
                    ) : <span title={ROLE_HINT[m.role]}>{ROLE_LABEL[m.role]}</span>}
                  </td>
                  <td className={`${td} text-right`}>
                    {(editable || (m.user_id === session.userId && m.role !== 'owner')) && (
                      <ConfirmButton action={removeMember} fields={{ site: slug, user: m.user_id }} className={btn.ghost}
                        title={m.user_id === session.userId ? 'Keluar dari situs ini?' : `Hapus ${p.name || p.email}?`}
                        message="Akses ke situs ini langsung dicabut." confirmLabel={m.user_id === session.userId ? 'Keluar' : 'Hapus'}>
                        {m.user_id === session.userId ? 'Keluar' : 'Hapus'}
                      </ConfirmButton>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {manage && (
        <Card title="Undang anggota" description="Kirim link undangan ke orang yang Anda undang. Link berlaku 7 hari dan hanya bisa dipakai dengan email tersebut.">
          <InviteForm site={slug} />
          {invites.length > 0 && (
            <ul className="mt-6 divide-y divide-line border-t border-line">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{i.email}</span> <span className="text-muted">· {ROLE_LABEL[i.role]}</span>
                    {new Date(i.expires_at) < new Date() && <span className="ml-2 text-danger">kedaluwarsa</span>}
                  </span>
                  <CopyButton text={`${APP_URL}/undangan/${i.token}`} className={btn.secondary}>Salin link</CopyButton>
                  <ConfirmButton action={revokeInvite} fields={{ site: slug, id: i.id }} className={btn.ghost}
                    title={`Batalkan undangan ${i.email}?`} confirmLabel="Batalkan">Batalkan</ConfirmButton>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

export default function MembersPage({ params }) {
  return <Suspense fallback={<TableSkeleton rows={3} />}><Members params={params} /></Suspense>;
}
