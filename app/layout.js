import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ variable: '--font-jakarta', subsets: ['latin'] });

export const metadata = {
  title: { default: 'Fauqa One Click', template: '%s · Fauqa One Click' },
  description: 'Buat website company profile dalam hitungan menit.',
  robots: { index: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body className="bg-bg font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
