'use client';

// Demo di hero: nama perusahaan + industri → pratinjau beranda di setiap theme bawaan.
import { useState } from 'react';

// Subset font Google: hanya huruf yang mungkin diketik, agar halaman tetap ringan.
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,&-\'’';

export default function Demo({ themes, industries, cta }) {
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState(industries[0]?.key);
  const ind = industries.find((i) => i.key === industry) ?? {};
  const label = name.trim() || 'PT Nama Perusahaan';
  const fonts = [...new Set(themes.flatMap((t) => [t.font_heading, t.font_body]).filter(Boolean))];
  const fontHref = `https://fonts.googleapis.com/css2?${fonts.map((f) => `family=${encodeURIComponent(f)}:wght@400;700`).join('&')}&text=${encodeURIComponent(GLYPHS + ind.heading + ind.cta)}&display=swap`;

  return (
    <div className="mt-10">
      <link rel="stylesheet" href={fontHref} />
      <form action={cta.split('?')[0]} className="flex max-w-2xl flex-col gap-3 sm:flex-row">
        {new URL(cta).searchParams.get('ref') && <input type="hidden" name="ref" value={new URL(cta).searchParams.get('ref')} />}
        <label className="min-w-0 flex-1">
          <span className="sr-only">Nama perusahaan</span>
          <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="Ketik nama perusahaan Anda"
            className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-muted/80" />
        </label>
        <button type="submit" className="rounded-lg bg-accent px-6 py-3 font-semibold text-accent-ink hover:opacity-90">Buat website gratis</button>
      </form>

      <fieldset className="mt-5">
        <legend className="text-sm text-muted">Industri</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {industries.map((i) => (
            <label key={i.key} className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm has-checked:border-accent has-checked:bg-accent-tint has-checked:text-accent has-focus-visible:outline-2 has-focus-visible:outline-accent">
              <input type="radio" name="industry-demo" value={i.key} checked={industry === i.key} onChange={() => setIndustry(i.key)} className="sr-only" />
              {i.name}
            </label>
          ))}
        </div>
      </fieldset>

      <ul aria-label={`Pratinjau ${themes.length} theme`} className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((t) => (
          <li key={t.key} className="overflow-hidden rounded-xl border border-line bg-surface">
            <div aria-hidden="true" className="flex h-56 flex-col px-5 py-4" style={{ background: t.color_background, color: t.color_ink, fontFamily: `"${t.font_body}", sans-serif` }}>
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <span className="truncate font-bold">{label}</span>
                <span className="shrink-0 opacity-60">Produk · Tentang · Kontak</span>
              </div>
              <p className="mt-auto line-clamp-3 text-xl leading-tight font-bold" style={{ fontFamily: `"${t.font_heading}", serif`, textTransform: t.uppercase_headings ? 'uppercase' : undefined }}>{ind.heading}</p>
              <span className="mt-3 self-start rounded px-3 py-1.5 text-[11px] font-semibold" style={{ background: t.color_accent, color: t.color_on_accent ?? '#fff' }}>{ind.cta}</span>
            </div>
            <p className="flex items-center justify-between border-t border-line px-4 py-2.5 text-sm">
              <span className="font-semibold">{t.name}</span>
              <span className="text-muted">{t.font_heading}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
