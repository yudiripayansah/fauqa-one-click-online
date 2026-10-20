'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [['/platform', 'Situs'], ['/platform/laporan', 'Laporan'], ['/platform/theme', 'Theme bawaan'], ['/platform/preset', 'Preset industri'], ['/platform/plan', 'Plan & kuota'], ['/platform/audit', 'Log audit']];

export default function PlatformNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Menu platform" className="flex gap-1 overflow-x-auto md:block md:space-y-0.5">
      {ITEMS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={(href === '/platform' ? pathname === href : pathname.startsWith(href)) ? 'page' : undefined}
          className="block shrink-0 rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-line/40 hover:text-ink aria-[current=page]:bg-accent-tint aria-[current=page]:font-semibold aria-[current=page]:text-accent">
          {label}
        </Link>
      ))}
    </nav>
  );
}
