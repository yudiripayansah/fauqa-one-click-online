// "Lihat situs": cek keanggotaan, lalu buka situs dengan token preview (draft & halaman draft ikut terlihat).
import { NextResponse } from 'next/server';
import { requireSite } from '@/lib/dal';
import { createPreviewToken } from '@/lib/preview';
import { siteUrl } from '@/lib/hosts';

export async function GET(req, { params }) {
  const { site: slug } = await params;
  const { session, site } = await requireSite(slug);
  // ?theme=<id>: preview theme tersimpan (dicek milik situs saat render).
  const theme = req.nextUrl.searchParams.get('theme');
  const extra = /^[0-9a-f-]{36}$/.test(theme ?? '') ? { t: theme } : {};
  return NextResponse.redirect(`${siteUrl(site.slug)}/?preview=${createPreviewToken(site.id, session.userId, 3600, extra)}`);
}
