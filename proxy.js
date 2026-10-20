// proxy.js (PRD §7, §8.2)
// - app.<ROOT>: admin. Refresh session Supabase + redirect ke /login bila belum masuk. Otorisasi asli di lib/dal.js + RLS.
// - <slug>.<ROOT> & custom domain: rewrite ke /site/<host>/<path> (render Liquid). Situs tenant tidak bisa mencapai route admin.
// - <ROOT> polos: landing page (/), dokumentasi theme (/docs), laporan penyalahgunaan (/laporkan); path lain redirect ke admin.
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { APP_URL, classifyHost } from '@/lib/hosts';
import { cookieOptions } from '@/lib/supabase/cookies';

const PUBLIC_ADMIN = /^\/(login|daftar|auth)(\/|$)/;

export async function proxy(req) {
  // x-forwarded-host: host asli saat Next me-render tujuan redirect Server Action lewat fetch internal ke
  // origin server (localhost:3000), dan di belakang proxy Vercel. Tanpa ini redirect action berakhir di /login.
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
  const kind = classifyHost(host);
  const { pathname, search } = req.nextUrl;
  // Vercel Cron memanggil URL deployment (host apa pun); route memeriksa CRON_SECRET sendiri.
  if (pathname.startsWith('/api/cron/')) return NextResponse.next();

  if (kind === 'root') {
    // Domain induk: landing page, dokumentasi theme, laporan penyalahgunaan; selain itu ke admin.
    if (pathname === '/' || pathname.startsWith('/docs') || pathname === '/laporkan') {
      const url = req.nextUrl.clone();
      url.pathname = `/landing${pathname === '/' ? '' : pathname}`;
      return NextResponse.rewrite(url);
    }
    return NextResponse.redirect(new URL(pathname + search, APP_URL));
  }
  if (kind === 'admin') {
    // Render situs tidak boleh berjalan di origin admin (JS theme ≠ origin admin).
    if (pathname.startsWith('/site/')) return new NextResponse('Not found', { status: 404 });
    if (pathname.startsWith('/api/')) return NextResponse.next();
    return session(req, !PUBLIC_ADMIN.test(pathname));
  }

  const url = req.nextUrl.clone();
  url.pathname = `/site/${encodeURIComponent(host.toLowerCase())}${pathname}`;
  return NextResponse.rewrite(url);
}

async function session(req, required) {
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookieOptions,
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub || !required) return res;

  const login = new URL('/login', req.url);
  login.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // Semua kecuali aset build Next dan ikon/logo platform (public/brand). File statis situs tenant (robots.txt, aset theme) juga lewat sini.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|brand/).*)'],
};
