// Formulir "Laporkan situs" di domain induk (PRD §8.2), dibuka dari badge setiap situs.
import { Suspense } from 'react';
import { Brand } from '@/components/admin/AuthShell';
import ReportForm from './ReportForm';

export const metadata = { title: { absolute: 'Laporkan situs · Fauqa One Click' }, robots: { index: false } };

async function Form({ searchParams }) {
  const { situs } = await searchParams;
  return <ReportForm situs={/^[a-z0-9.-]{1,253}$/.test(situs ?? '') ? situs : ''} turnstileKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null} />;
}

export default function ReportPage({ searchParams }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- '/' di domain induk di-rewrite proxy ke /landing */}
      <a href="/" aria-label="Fauqa One Click, beranda"><Brand /></a>
      <h1 className="mt-10 text-2xl font-extrabold tracking-tight">Laporkan situs</h1>
      <p className="mt-2 text-muted">Situs di Fauqa One Click dibuat oleh pemiliknya masing-masing. Bila sebuah situs meminta password, data kartu, transfer mencurigakan, atau melanggar hukum, laporkan di sini. Tim kami meninjau setiap laporan.</p>
      <Suspense fallback={<div className="h-96" />}><Form searchParams={searchParams} /></Suspense>
    </main>
  );
}
