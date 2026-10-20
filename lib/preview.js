// Token preview situs (PRD §8.2): HMAC bertanda tangan, berumur pendek. Dibuat di admin, dibaca di domain situs.
import { createHmac, timingSafeEqual } from 'node:crypto';

const secret = () => {
  const s = process.env.PREVIEW_SECRET;
  if (!s || s.length < 32) throw new Error('PREVIEW_SECRET belum diisi (min. 32 karakter).');
  return s;
};
const sign = (data) => createHmac('sha256', secret()).update(data).digest('base64url');

// extra: { t: themeId } untuk theme editor (theme selain theme live).
export function createPreviewToken(siteId, userId, ttlSec = 3600, extra = {}) {
  const data = Buffer.from(JSON.stringify({ s: siteId, u: userId, exp: Math.floor(Date.now() / 1000) + ttlSec, ...extra })).toString('base64url');
  return `${data}.${sign(data)}`;
}

// → { s, u, exp, t? } atau null
export function verifyPreviewToken(token) {
  const [data, sig] = String(token ?? '').split('.');
  if (!data || !sig) return null;
  const expected = Buffer.from(sign(data));
  const got = Buffer.from(sig);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, 'base64url').toString());
    return p.exp > Date.now() / 1000 ? p : null;
  } catch { return null; }
}
