import AuthShell from '@/components/admin/AuthShell';
import PasswordForm from './PasswordForm';

export const metadata = { title: 'Ganti password' };

export default function PasswordPage() {
  return (
    <AuthShell title="Buat password baru">
      <PasswordForm />
    </AuthShell>
  );
}
