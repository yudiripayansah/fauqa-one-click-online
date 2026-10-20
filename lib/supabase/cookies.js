// Cookie sesi admin (PRD §8.2): host-only, prefix __Host- di produksi (https), HttpOnly, tanpa Domain.
// Subdomain situs tenant tidak bisa membaca maupun menimpanya.
const secure = (process.env.PROTOCOL || 'http') === 'https';

export const cookieOptions = {
  name: secure ? '__Host-sb' : 'sb',
  path: '/',
  secure,
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60, // tetap login 30 hari
};
