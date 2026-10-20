import Link from 'next/link';

// Tanda logo: kursor yang sedang mengklik (public/brand/mark.svg, app/icon.svg).
export function BrandMark({ className = 'size-7' }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className={`shrink-0 ${className}`}>
      <rect width="64" height="64" rx="15" fill="#2448C9" />
      <g transform="translate(32 32) scale(1.12) translate(-32 -29)">
        <path d="M27 22.5v26.8c0 1 1.2 1.5 1.9.8l6-6.3 4.3 9.2c.4.8 1.3 1.1 2.1.8l3.2-1.5c.8-.4 1.1-1.3.7-2.1l-4.3-9h8.6c1 0 1.5-1.2.8-1.9L28.9 21.7c-.7-.7-1.9-.2-1.9.8Z" fill="#fff" />
        <path d="M21.5 22.5h-6M22.4 16.4l-4.3-4.3M27.5 15.5v-6" stroke="#FFC21A" strokeWidth="3.6" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function Brand({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 text-xl font-extrabold leading-none tracking-tight ${className}`}>
      <BrandMark className="size-[1.4em]" />
      <span>Fauqa <span className="text-accent">One Click</span></span>
    </span>
  );
}

// Kerangka halaman login/daftar.
export default function AuthShell({ title, children, footer }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/login" className="mb-6 inline-block"><Brand /></Link>
        <div className="rounded-card border border-line bg-surface p-8">
          <h1 className="text-lg font-semibold">{title}</h1>
          {children}
        </div>
        {footer && <p className="mt-6 text-center text-sm text-muted">{footer}</p>}
      </div>
    </main>
  );
}
