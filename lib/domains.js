// Custom domain (PRD §4.10) lewat Vercel Domains API. Tanpa VERCEL_TOKEN + VERCEL_PROJECT_ID (development):
// domain hanya disimpan, status tetap pending_dns, dan bisa diaktifkan manual lewat SQL untuk uji routing.
import { ROOT_DOMAIN } from './hosts.js';

const API = 'https://api.vercel.com';
export const vercelConfigured = () => !!(process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT_ID);

async function vercel(method, path, body) {
  const team = process.env.VERCEL_TEAM_ID ? `${path.includes('?') ? '&' : '?'}teamId=${process.env.VERCEL_TEAM_ID}` : '';
  const res = await fetch(`${API}${path}${team}`, {
    method,
    headers: { authorization: `Bearer ${process.env.VERCEL_TOKEN}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 404) throw new Error(data.error?.message ?? `Vercel ${res.status}`);
  return res.status === 404 ? null : data;
}
const project = () => `/v9/projects/${encodeURIComponent(process.env.VERCEL_PROJECT_ID)}/domains`;

// Hostname yang boleh ditambahkan: huruf/angka/tanda hubung per label, minimal satu titik, bukan domain platform.
export function normalizeHostname(input) {
  const h = String(input ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '');
  if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h)) return { error: 'Tulis domain tanpa http://, mis. acme.co.id atau www.acme.co.id.' };
  const root = ROOT_DOMAIN.replace(/:\d+$/, '');
  if (h === root || h.endsWith(`.${root}`) || /(^|\.)fau-qa\.com$|(^|\.)vercel\.app$/.test(h)) return { error: 'Domain platform tidak bisa ditambahkan sebagai custom domain.' };
  return { hostname: h };
}

// ponytail: daftar SLD 2 tingkat yang umum di Indonesia; pakai Public Suffix List bila banyak domain luar negeri.
const SLD = new Set(['co.id', 'ac.id', 'or.id', 'web.id', 'my.id', 'biz.id', 'sch.id', 'go.id', 'net.id', 'ponpes.id', 'desa.id', 'co.uk', 'com.au', 'com.sg', 'com.my']);
export const isApex = (h) => { const p = h.split('.'); return p.length === 2 || (p.length === 3 && SLD.has(p.slice(1).join('.'))); };

/** Record DNS yang harus dibuat pemilik domain. */
export function dnsRecords(hostname, verification = {}) {
  const name = isApex(hostname) ? '@' : hostname.split('.')[0];
  const main = isApex(hostname)
    ? { type: 'A', name, value: verification.ipv4 ?? '76.76.21.21' }
    : { type: 'CNAME', name, value: verification.cname ?? 'cname.vercel-dns.com' };
  // Domain yang pernah dipakai akun Vercel lain butuh TXT verifikasi.
  const txt = (verification.challenges ?? []).map((c) => ({ type: c.type, name: c.domain, value: c.value }));
  return [main, ...txt];
}

export async function addToVercel(hostname) {
  if (!vercelConfigured()) return { verification: {} };
  const d = await vercel('POST', project().replace('/v9/', '/v10/'), { name: hostname });
  return { verification: { challenges: d?.verification ?? [] } };
}

export async function removeFromVercel(hostname) {
  if (vercelConfigured()) await vercel('DELETE', `${project()}/${hostname}`);
}

/** Status terbaru satu domain → { status, verification }. Dipakai tombol "Cek sekarang" dan cron. */
export async function checkDomain(domain) {
  if (!vercelConfigured()) return { status: domain.status, verification: domain.verification };
  let d = await vercel('GET', `${project()}/${domain.hostname}`);
  if (!d) d = await vercel('POST', project().replace('/v9/', '/v10/'), { name: domain.hostname }); // terhapus di Vercel → daftar ulang
  if (!d.verified) d = (await vercel('POST', `${project()}/${domain.hostname}/verify`).catch(() => null)) ?? d;
  const config = await vercel('GET', `/v6/domains/${domain.hostname}/config`);
  const verification = {
    challenges: d.verified ? [] : d.verification ?? [],
    ipv4: config?.recommendedIPv4?.[0]?.value?.[0],
    cname: config?.recommendedCNAME?.[0]?.value,
  };
  const status = !d.verified ? 'verifying' : config?.misconfigured ? (domain.status === 'active' ? 'misconfigured' : 'pending_dns') : 'active';
  return { status, verification };
}
