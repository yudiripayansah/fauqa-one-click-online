import { Suspense } from 'react';
import Link from 'next/link';
import AuthShell from '@/components/admin/AuthShell';
import LoginForm from './LoginForm';

export const metadata = { title: 'Masuk' };

async function Form({ searchParams }) {
  const { next, msg } = await searchParams;
  return (
    <>
      {msg === 'link-kedaluwarsa' && <p role="alert" className="mt-4 text-sm text-danger">Link sudah kedaluwarsa atau sudah dipakai. Masuk, atau pakai &quot;Lupa password?&quot;.</p>}
      <LoginForm next={next} />
    </>
  );
}

export default function LoginPage({ searchParams }) {
  return (
    <AuthShell title="Masuk ke akun Anda" footer={<>Belum punya akun? <Link href="/daftar" className="font-medium text-accent">Daftar gratis</Link></>}>
      <Suspense fallback={<div className="mt-8 h-56" aria-busy="true" />}>
        <Form searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
