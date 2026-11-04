// Komponen presentasional admin (server-safe). Semua warna lewat design token.
import Link from 'next/link';

export const btn = {
  primary: 'inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60',
  secondary: 'inline-flex items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-line/50 disabled:opacity-60',
  danger: 'inline-flex items-center justify-center gap-2 rounded-lg border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-60',
  ghost: 'inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted hover:bg-line/50 hover:text-ink',
};

export const inputCls =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 aria-[invalid=true]:border-danger';

// Varian tanpa lebar penuh, untuk kontrol sebaris (mis. bar aksi massal).
export const inlineInputCls = inputCls.replace('w-full ', '');

export function PageHeader({ title, description, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({ title, description, children, className = '' }) {
  return (
    <section className={`rounded-card border border-line bg-surface p-5 md:p-6 ${className}`}>
      {title && <h2 className="font-semibold">{title}</h2>}
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      <div className={title || description ? 'mt-4' : ''}>{children}</div>
    </section>
  );
}

// Props a11y untuk input yang punya error: tandai invalid & hubungkan ke pesan error Field.
export const errProps = (name, error) => (error ? { 'aria-invalid': true, 'aria-describedby': `${name}-error` } : {});

// Label + kontrol + hint/error. `children` adalah input; id harus sama dengan `name`.
export function Field({ label, name, hint, error, children, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={name} className="block text-sm font-medium">{label}</label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p id={`${name}-error`} className="mt-1.5 text-sm text-danger">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

export function EmptyState({ title, description, actionHref, actionLabel }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      {actionHref && (
        <Link href={actionHref} className={`${btn.primary} mt-4`}>{actionLabel}</Link>
      )}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }) {
  return (
    <div className="animate-pulse overflow-hidden rounded-xl border border-line bg-surface" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-4 border-b border-line px-4 py-4 last:border-0">
          <div className="h-4 w-1/3 rounded bg-line" />
          <div className="h-4 w-1/5 rounded bg-line" />
          <div className="ml-auto h-4 w-16 rounded bg-line" />
        </div>
      ))}
    </div>
  );
}

export const th = 'px-4 py-3 text-left text-xs font-medium text-muted';
export const td = 'px-4 py-3 align-middle';

// Paging daftar panjang (PostgREST juga memotong hasil di 1000 baris). range → argumen .range(), href(n) → URL halaman n.
export const PER_PAGE = 50;
export const pageOf = (v) => Math.max(1, Number.parseInt(v, 10) || 1);
export const pageRange = (n, per = PER_PAGE) => [(n - 1) * per, n * per - 1];
export const likeTerm = (q) => `%${String(q).replace(/[%_\\,()]/g, '')}%`;

export function Pager({ page, count, href, per = PER_PAGE }) {
  const last = Math.max(1, Math.ceil((count ?? 0) / per));
  if (last <= 1 && page <= 1) return null;
  return (
    <nav aria-label="Halaman daftar" className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
      <span>{(page - 1) * per < (count ?? 0) ? `${(page - 1) * per + 1}–${Math.min(page * per, count)} dari ${count} · halaman ${page} dari ${last}` : 'Halaman ini kosong.'}</span>
      <span className="flex gap-2">
        {page > 1 && <Link href={href(Math.min(page - 1, last))} className={btn.secondary}>Sebelumnya</Link>}
        {page < last && <Link href={href(page + 1)} className={btn.secondary}>Berikutnya</Link>}
      </span>
    </nav>
  );
}
