// Password situs (PRD §4.1): scrypt untuk hash; cookie akses = HMAC(hash) per situs → batal otomatis bila password diganti.
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(pw) {
  const salt = randomBytes(16).toString('base64url');
  return `scrypt$${salt}$${scryptSync(String(pw), salt, 32).toString('base64url')}`;
}
export function checkPassword(pw, stored) {
  const [, salt, hash] = String(stored ?? '').split('$');
  if (!salt || !hash) return false;
  const a = scryptSync(String(pw), salt, 32);
  const b = Buffer.from(hash, 'base64url');
  return a.length === b.length && timingSafeEqual(a, b);
}
const secret = () => process.env.PREVIEW_SECRET ?? 'dev';
export const accessCookieName = (siteId) => `fauqa_pw_${siteId.slice(0, 8)}`;
export const accessToken = (siteId, stored) => createHmac('sha256', secret()).update(`${siteId}:${stored}`).digest('base64url');
export const hasAccess = (siteId, stored, cookie) => {
  if (!cookie) return false;
  const a = Buffer.from(cookie);
  const b = Buffer.from(accessToken(siteId, stored));
  return a.length === b.length && timingSafeEqual(a, b);
};
