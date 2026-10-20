import { Suspense } from 'react';
import Link from 'next/link';
import AuthShell from '@/components/admin/AuthShell';
import SignupForm from './SignupForm';

export const metadata = { title: 'Daftar' };

// ?ref=<slug|landing>: sumber pendaftaran (badge situs / landing page).
async function Form({ searchParams }) {
  const { ref } = await searchParams;
  return <SignupForm source={/^[a-z0-9-]{1,40}$/.test(ref ?? '') ? ref : null} />;
}

export default function SignupPage({ searchParams }) {
  return (
    <AuthShell title="Buat website company Anda" footer={<>Sudah punya akun? <Link href="/login" className="font-medium text-accent">Masuk</Link></>}>
      <p className="mt-1 text-sm text-muted">Gratis. Setelah daftar, website Anda siap dalam beberapa menit.</p>
      <Suspense fallback={<SignupForm />}><Form searchParams={searchParams} /></Suspense>
    </AuthShell>
  );
}
