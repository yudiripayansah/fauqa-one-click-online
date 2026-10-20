'use client';

import { useActionState } from 'react';
import { report } from './actions';

const REASONS = [['phishing', 'Phishing', 'Meminta password, data kartu, atau login palsu'], ['scam', 'Penipuan', 'Menawarkan barang/jasa fiktif atau meminta transfer'], ['spam', 'Spam', 'Isi tidak relevan, iklan massal'], ['lainnya', 'Lainnya', 'Melanggar hukum atau hak cipta']];
const input = 'mt-1.5 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink';

export default function ReportForm({ situs, turnstileKey }) {
  const [state, action, pending] = useActionState(report, {});
  if (state.ok) return <p role="status" className="mt-6 rounded-lg bg-accent-tint px-4 py-3">Terima kasih. Laporan Anda sudah kami terima dan segera ditinjau.</p>;
  const v = state.values ?? {};
  return (
    <form action={action} className="mt-6 space-y-5">
      <label className="block text-sm font-medium">Alamat situs
        <input name="situs" required defaultValue={v.situs ?? situs} placeholder="nama.oneclick.fau-qa.com" className={input} />
      </label>
      <fieldset>
        <legend className="text-sm font-medium">Alasan</legend>
        <div className="mt-2 space-y-2">
          {REASONS.map(([val, label, hint]) => (
            <label key={val} className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 text-sm has-checked:border-accent has-checked:bg-accent-tint">
              <input type="radio" name="reason" value={val} required defaultChecked={v.reason === val} className="mt-0.5" />
              <span><b>{label}</b><span className="block text-muted">{hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-medium">Detail (opsional)
        <textarea name="detail" rows={4} maxLength={2000} defaultValue={v.detail} placeholder="Halaman mana, apa yang terjadi" className={input} />
      </label>
      <label className="block text-sm font-medium">Email Anda (opsional, bila kami perlu menghubungi)
        <input name="email" type="email" defaultValue={v.email} className={input} />
      </label>
      <div aria-hidden="true" style={{ position: 'absolute', left: -9999 }}><input name="website" tabIndex={-1} autoComplete="off" /></div>
      {turnstileKey && <><div className="cf-turnstile" data-sitekey={turnstileKey} /><script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer /></>}
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-accent-ink disabled:opacity-60">{pending ? 'Mengirim…' : 'Kirim laporan'}</button>
    </form>
  );
}
