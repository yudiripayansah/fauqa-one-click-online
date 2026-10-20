// Host & URL (PRD §3.1, §7). Admin di app.<ROOT_DOMAIN>, situs di <slug>.<ROOT_DOMAIN> atau custom domain.
export const ROOT_DOMAIN = process.env.ROOT_DOMAIN || 'localhost:3000';
export const PROTOCOL = process.env.PROTOCOL || 'http';
export const APP_HOST = `app.${ROOT_DOMAIN}`;
export const APP_URL = `${PROTOCOL}://${APP_HOST}`;
export const siteUrl = (slug) => `${PROTOCOL}://${slug}.${ROOT_DOMAIN}`;

// 'admin' | 'root' | { slug } | { custom: hostname }
export function classifyHost(host) {
  host = (host ?? '').toLowerCase();
  if (host === APP_HOST) return 'admin';
  if (host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`) return 'root';
  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    const slug = host.slice(0, -ROOT_DOMAIN.length - 1);
    return /^[a-z0-9-]+$/.test(slug) ? { slug } : { custom: host };
  }
  return { custom: host.replace(/:\d+$/, '') };
}
