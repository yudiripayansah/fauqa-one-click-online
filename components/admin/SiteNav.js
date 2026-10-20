'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';

// Navigasi per situs (PRD §5). Tampilan, Analytics, dan Pengaturan lain menyusul per fase.
const GROUPS = [
  [null, [['', 'Beranda']]],
  ['Konten', [['/halaman', 'Halaman'], ['/produk', 'Produk'], ['/koleksi', 'Koleksi'], ['/blog', 'Blog'], ['/menu', 'Menu'], ['/form', 'Form masuk'], ['/file', 'File'], ['/redirect', 'Redirect'], ['/terjemahan', 'Terjemahan']]],
  ['Tampilan', [['/tema', 'Theme']]],
  ['Analytics', [['/analytics', 'Analytics']]],
  ['Pengaturan', [['/pengaturan', 'Umum'], ['/domain', 'Domain'], ['/anggota', 'Anggota']]],
];

export default function SiteNav() {
  const { site } = useParams();
  const pathname = usePathname();
  return (
    <nav aria-label="Menu situs" className="flex gap-1 overflow-x-auto md:block md:space-y-4">
      {GROUPS.map(([label, items]) => (
        <div key={label ?? 'main'} className="flex gap-1 md:block md:space-y-0.5">
          {label && <p className="hidden px-3 pb-1 text-xs font-medium text-muted md:block">{label}</p>}
          {items.map(([path, text]) => {
            const href = `/s/${site}${path}`;
            const active = path ? pathname.startsWith(href) : pathname === href;
            return (
              <Link key={path} href={href} aria-current={active ? 'page' : undefined}
                className="block shrink-0 rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-line/40 hover:text-ink aria-[current=page]:bg-accent-tint aria-[current=page]:font-semibold aria-[current=page]:text-accent">
                {text}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
