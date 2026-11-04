'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

// Ikon garis 24×24 (gaya Lucide), satu path per menu.
const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  page: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z M14 3v5h5 M9 13h6 M9 17h6',
  product: 'M21 8 12 3 3 8v8l9 5 9-5z M3 8l9 5 9-5 M12 13v8',
  collection: 'M12 3 2 8l10 5 10-5z M2 12.5l10 5 10-5 M2 17l10 5 10-5',
  blog: 'M4 4h13v16H6a2 2 0 0 1-2-2z M17 8h3v10a2 2 0 0 1-2 2 M8 8h5 M8 12h5 M8 16h5',
  menu: 'M8 6h13 M8 12h13 M8 18h13 M3.5 6h.01 M3.5 12h.01 M3.5 18h.01',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z',
  file: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z M21 15l-5-5L5 21 M8.5 8.5h.01',
  redirect: 'M15 4l5 5-5 5 M20 9H9a5 5 0 0 0-5 5v6',
  language: 'M5 8l6 6 M4 14l6-6 2-3 M2 5h12 M7 2h1 M22 22l-5-10-5 10 M14 18h6',
  theme: 'M12 21a9 9 0 1 1 9-9c0 2-1.5 3-3 3h-2a2 2 0 0 0-1.5 3.3A1.7 1.7 0 0 1 12 21z M7.5 11h.01 M10 7.5h.01 M14.5 7.5h.01',
  chart: 'M3 20h18 M6 16v-5 M11 16V6 M16 16V9',
  settings: 'M3 6h11 M18 6h3 M3 12h5 M12 12h9 M3 18h13 M20 18h1 M16 4v4 M10 10v4 M18 16v4',
  domain: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18',
  members: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8',
};

// Navigasi per situs (PRD §5). Tampilan, Analytics, dan Pengaturan lain menyusul per fase.
const GROUPS = [
  [null, [['', 'Beranda', 'home']]],
  ['Konten', [['/halaman', 'Halaman', 'page'], ['/produk', 'Produk', 'product'], ['/koleksi', 'Koleksi', 'collection'], ['/blog', 'Blog', 'blog'], ['/menu', 'Menu', 'menu'], ['/form', 'Form masuk', 'inbox'], ['/file', 'File', 'file'], ['/redirect', 'Redirect', 'redirect'], ['/terjemahan', 'Terjemahan', 'language']]],
  ['Tampilan', [['/tema', 'Theme', 'theme']]],
  ['Analytics', [['/analytics', 'Analytics', 'chart']]],
  ['Pengaturan', [['/pengaturan', 'Umum', 'settings'], ['/domain', 'Domain', 'domain'], ['/anggota', 'Anggota', 'members']]],
];

export default function SiteNav() {
  const { site } = useParams();
  const pathname = usePathname();
  return (
    <nav aria-label="Menu situs" className="flex gap-1 overflow-x-auto md:block md:space-y-4">
      {GROUPS.map(([label, items]) => (
        <div key={label ?? 'main'} className="flex gap-1 md:block md:space-y-0.5">
          {label && <p className="hidden px-3 pb-1 text-xs font-medium text-muted md:block">{label}</p>}
          {items.map(([path, text, icon]) => {
            const href = `/s/${site}${path}`;
            const active = path ? pathname.startsWith(href) : pathname === href;
            return (
              <Link key={path} href={href} aria-current={active ? 'page' : undefined}
                className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-line/40 hover:text-ink aria-[current=page]:bg-accent-tint aria-[current=page]:font-semibold aria-[current=page]:text-accent">
                <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={ICONS[icon]} />
                </svg>
                {text}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
