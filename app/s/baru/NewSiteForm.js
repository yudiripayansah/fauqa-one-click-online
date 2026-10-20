'use client';

// Wizard buat situs (PRD §4.2). Satu form; langkah lain hanya disembunyikan agar semua isian ikut terkirim.
import { useActionState, useEffect, useRef, useState } from 'react';
import { Field, inputCls, btn, errProps } from '@/components/admin/ui';
import { createSite } from '../actions';

const toSlug = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/^(pt|cv|ud)\.?\s+/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

const STEPS = ['Company', 'Cerita', 'Brand', 'Theme', 'Kontak'];
// Langkah tempat field berada, untuk melompat ke error dari server.
const FIELD_STEP = { name: 0, slug: 0, theme: 3, email: 4 };

function ThemeCard({ theme, preset, selected, name, logo, accent, onPick }) {
  const p = { ...preset, ...(accent ? { color_accent: accent } : {}) };
  const onAccent = accent ? undefined : p.color_on_accent;
  return (
    <label className={`block cursor-pointer overflow-hidden rounded-xl border-2 ${selected ? 'border-accent' : 'border-line hover:border-muted'}`}>
      <input type="radio" name="theme" value={theme.key} checked={selected} onChange={onPick} className="sr-only" />
      <div aria-hidden="true" className="h-36 px-4 py-3" style={{ background: p.color_background, color: p.color_ink, fontFamily: `"${p.font_body}", sans-serif` }}>
        <div className="flex items-center justify-between text-[10px] opacity-70">
          {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau blob lokal */}
          {logo ? <img src={logo} alt="" className="h-4 w-auto" /> : <span className="font-semibold">{name}</span>}
          <span>Beranda · Produk · Kontak</span>
        </div>
        <p className="mt-4 line-clamp-2 text-lg leading-tight font-bold" style={{ fontFamily: `"${p.font_heading}", serif`, textTransform: p.uppercase_headings ? 'uppercase' : undefined }}>{name}</p>
        <span className="mt-3 inline-block rounded px-2.5 py-1 text-[10px] font-semibold" style={{ background: p.color_accent, color: onAccent ?? '#fff' }}>Hubungi kami</span>
      </div>
      <div className="flex items-center justify-between border-t border-line bg-surface px-3 py-2 text-sm">
        <span className="font-medium">{theme.name}</span>
        <span className="text-xs text-muted">{p.font_heading}</span>
      </div>
    </label>
  );
}

export default function NewSiteForm({ industries, rootDomain, themes }) {
  const [state, action, pending] = useActionState(createSite, {});
  const v = state.values ?? {};
  const e = state.error ?? {};
  const [step, setStep] = useState(0);
  const [name, setName] = useState(v.name ?? '');
  const [slug, setSlug] = useState(v.slug ?? '');
  const [touched, setTouched] = useState(false);
  const [theme, setTheme] = useState(v.theme || themes[0]?.key);
  const [style, setStyle] = useState(v.style ?? '');
  const [ownColor, setOwnColor] = useState(!!v.ownColor);
  const [accent, setAccent] = useState(v.accent || '#1F5FA8');
  const [logo, setLogo] = useState(null);
  const steps = useRef([]);

  // Error dari server: buka langkah yang berisi field bermasalah.
  useEffect(() => {
    const first = Object.keys(state.error ?? {})[0];
    if (first in FIELD_STEP) setStep(FIELD_STEP[first]); // eslint-disable-line react-hooks/set-state-in-effect
  }, [state]);
  useEffect(() => () => logo && URL.revokeObjectURL(logo), [logo]);

  const next = () => {
    const invalid = [...steps.current[step].querySelectorAll('input, select, textarea')].find((el) => !el.checkValidity());
    if (invalid) return invalid.reportValidity();
    setStep(step + 1);
  };
  const current = themes.find((t) => t.key === theme) ?? themes[0];
  const presetOf = (t) => t.presets.find((p) => p.name === (t.key === theme ? style : '')) ?? t.presets[0] ?? {};
  const fonts = [...new Set(themes.flatMap((t) => t.presets.flatMap((p) => [p.font_heading, p.font_body])).filter(Boolean))];
  const label = name.trim() || 'Nama company';

  return (
    <form action={action} className="rounded-card border border-line bg-surface p-6 md:p-8"
      onKeyDown={(ev) => { if (ev.key === 'Enter' && ev.target.tagName === 'INPUT' && step < STEPS.length - 1) { ev.preventDefault(); next(); } }}>
      <h1 className="text-2xl font-semibold">Buat website company</h1>
      <ol className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Langkah">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? 'step' : undefined} className={i === step ? 'font-semibold text-ink' : i < step ? 'text-ink' : 'text-muted'}>
            <span className={`mr-1.5 inline-grid size-6 place-items-center rounded-full text-xs ${i <= step ? 'bg-accent text-accent-ink' : 'bg-line'}`}>{i + 1}</span>{s}
          </li>
        ))}
      </ol>

      <fieldset ref={(el) => (steps.current[0] = el)} hidden={step !== 0} className="mt-6 space-y-5">
        <legend className="sr-only">Company</legend>
        <Field label="Nama company" name="name" error={e.name}>
          <input id="name" name="name" required maxLength={120} value={name} className={inputCls} {...errProps('name', e.name)}
            onChange={(ev) => { setName(ev.target.value); if (!touched) setSlug(toSlug(ev.target.value)); }} />
        </Field>
        <Field label="Alamat website" name="slug" error={e.slug} hint="Bisa diganti nanti, atau pakai domain sendiri.">
          <div className="flex items-center rounded-lg border border-line bg-surface focus-within:outline-2 focus-within:outline-accent">
            <input id="slug" name="slug" required value={slug} pattern="[a-z0-9]([a-z0-9\-]{0,38}[a-z0-9])?" title="Huruf kecil, angka, dan tanda hubung" {...errProps('slug', e.slug)}
              onChange={(ev) => { setTouched(true); setSlug(ev.target.value.toLowerCase()); }}
              className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2 text-sm outline-none" />
            <span className="pr-3 text-sm text-muted">.{rootDomain}</span>
          </div>
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Industri" name="industry" hint="Menentukan teks, produk, dan artikel contoh.">
            <select id="industry" name="industry" defaultValue={v.industry || 'umum'} className={inputCls}>
              {industries.map(([val, l]) => <option key={val} value={val}>{l}</option>)}
            </select>
          </Field>
          <Field label="Bahasa utama" name="locale">
            <select id="locale" name="locale" defaultValue={v.locale ?? 'id'} className={inputCls}>
              <option value="id">Bahasa Indonesia</option>
              <option value="en">English</option>
            </select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="second" defaultChecked={v.second} /> Aktifkan juga bahasa kedua (Indonesia + English)</label>
      </fieldset>

      <fieldset ref={(el) => (steps.current[1] = el)} hidden={step !== 1} className="mt-6 space-y-3">
        <legend className="sr-only">Cerita company</legend>
        <Field label="Ceritakan company Anda" name="description" hint="Opsional. Tulis 2–5 kalimat: apa yang dijual, untuk siapa, dan apa keunggulannya. AI memakainya untuk menulis isi website; bila kosong, dipakai teks contoh industri.">
          <textarea id="description" name="description" rows={6} maxLength={2000} defaultValue={v.description} className={inputCls}
            placeholder="Contoh: Kami produsen rangka atap baja ringan di Cikarang sejak 2010. Pelanggan kami kontraktor dan developer perumahan di Jawa Barat. Produk bersertifikat SNI, bisa kirim dalam 3 hari." />
        </Field>
      </fieldset>

      <fieldset ref={(el) => (steps.current[2] = el)} hidden={step !== 2} className="mt-6 space-y-5">
        <legend className="sr-only">Brand</legend>
        <div>
          <label htmlFor="logo" className="block text-sm font-medium">Logo</label>
          <div className="mt-1.5 flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- pratinjau blob lokal */}
            {logo && <img src={logo} alt="Pratinjau logo" className="h-12 w-auto rounded border border-line p-1" />}
            <input id="logo" name="logo" type="file" accept=".png,.jpg,.jpeg,.webp,.svg" className="text-sm"
              onChange={(ev) => { const f = ev.target.files?.[0]; setLogo(f ? URL.createObjectURL(f) : null); }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">Opsional. PNG, JPG, WebP, atau SVG, maks. 10 MB.</p>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="own_color" checked={ownColor} onChange={(ev) => setOwnColor(ev.target.checked)} /> Pakai warna brand sendiri</label>
          {ownColor && (
            <div className="mt-2 flex items-center gap-3">
              <input type="color" name="accent" value={accent} onChange={(ev) => setAccent(ev.target.value)} aria-label="Warna utama" className="h-10 w-14 cursor-pointer rounded border border-line" />
              <span className="font-mono text-sm">{accent.toUpperCase()}</span>
            </div>
          )}
          <p className="mt-1.5 text-xs text-muted">Tanpa ini, warna mengikuti gaya theme yang dipilih. Warna teks di atas tombol diatur otomatis agar tetap terbaca.</p>
        </div>
      </fieldset>

      <fieldset ref={(el) => (steps.current[3] = el)} hidden={step !== 3} className="mt-6">
        <legend className="text-sm text-muted">Pilih tampilan. Semua bisa diubah lagi lewat editor theme.</legend>
        {step >= 3 && <link rel="stylesheet" href={`https://fonts.googleapis.com/css2?${fonts.map((f) => `family=${encodeURIComponent(f)}:wght@400;700`).join('&')}&display=swap`} />}
        {e.theme && <p className="mt-2 text-sm text-danger">{e.theme}</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {themes.map((t) => (
            <ThemeCard key={t.key} theme={t} preset={presetOf(t)} selected={t.key === theme} name={label} logo={logo} accent={ownColor ? accent : null}
              onPick={() => { setTheme(t.key); setStyle(''); }} />
          ))}
        </div>
        {current?.presets.length > 1 && (
          <div className="mt-5">
            <p className="text-sm font-medium">Gaya {current.name}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {current.presets.map((p, i) => (
                <label key={p.name} className="flex cursor-pointer items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm has-checked:border-accent has-checked:bg-accent-tint">
                  <input type="radio" name="style" value={p.name} checked={style ? style === p.name : i === 0} onChange={() => setStyle(p.name)} className="sr-only" />
                  <span aria-hidden="true" className="flex">{[p.color_accent, p.color_ink, p.color_background].map((c) => <span key={c} className="-ml-1 size-4 rounded-full border border-line first:ml-0" style={{ background: c }} />)}</span>
                  {p.name}
                </label>
              ))}
            </div>
          </div>
        )}
      </fieldset>

      <fieldset ref={(el) => (steps.current[4] = el)} hidden={step !== 4} className="mt-6 space-y-5">
        <legend className="text-sm text-muted">Tampil di footer, halaman Kontak, dan tombol WhatsApp. Boleh dilengkapi nanti.</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Email" name="email" error={e.email}><input id="email" name="email" type="email" defaultValue={v.email} className={inputCls} {...errProps('email', e.email)} /></Field>
          <Field label="Telepon" name="phone"><input id="phone" name="phone" type="tel" defaultValue={v.phone} className={inputCls} /></Field>
          <Field label="WhatsApp" name="whatsapp" hint="Nomor HP, mis. 0812…"><input id="whatsapp" name="whatsapp" type="tel" defaultValue={v.whatsapp} className={inputCls} /></Field>
        </div>
        <Field label="Alamat" name="address"><textarea id="address" name="address" rows={2} defaultValue={v.address} className={inputCls} /></Field>
      </fieldset>

      <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
        {step > 0 ? <button type="button" onClick={() => setStep(step - 1)} className={btn.secondary}>Kembali</button> : <span />}
        {step < STEPS.length - 1
          ? <button type="button" onClick={next} className={btn.primary}>Lanjut</button>
          : <button type="submit" disabled={pending} className={`${btn.primary} px-6`}>{pending ? 'Membuat website… (bisa sampai 1 menit)' : 'Buat website'}</button>}
      </div>
    </form>
  );
}
