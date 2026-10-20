import { SubmitButton } from '@/components/admin/client';
import { btn, inlineInputCls } from '@/components/admin/ui';
import { setSuspended } from './actions';

// Suspend (dengan alasan yang dilihat pemilik) atau cabut suspend.
export default function SuspendForm({ site, back, report = false }) {
  const hidden = <><input type="hidden" name="id" value={site.id} /><input type="hidden" name="back" value={back} />{report && <input type="hidden" name="report" value="1" />}</>;
  if (site.status === 'suspended') {
    return <form action={setSuspended}>{hidden}<input type="hidden" name="suspend" value="0" /><SubmitButton className={btn.secondary} pendingText="Memproses…">Cabut suspend</SubmitButton></form>;
  }
  return (
    <details className="relative">
      <summary className={`${btn.danger} cursor-pointer list-none`}>Suspend</summary>
      <form action={setSuspended} className="absolute right-0 z-10 mt-1 flex w-72 flex-col gap-2 rounded-lg border border-line bg-surface p-3 shadow-lg">
        {hidden}<input type="hidden" name="suspend" value="1" />
        <label className="text-sm">Alasan (terlihat oleh pemilik)<input name="reason" required maxLength={500} className={`${inlineInputCls} mt-1 w-full`} /></label>
        <SubmitButton className={btn.danger} pendingText="Memproses…">Suspend sekarang</SubmitButton>
      </form>
    </details>
  );
}
