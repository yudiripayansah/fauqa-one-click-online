// POST /contact dari situs tenant (PRD §4.7): form kontak, inquiry produk, newsletter.
// Anti-spam: honeypot + Cloudflare Turnstile (bila dikonfigurasi) + rate limit 5 kiriman / 10 menit / IP / situs.
import { createHmac } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { trackEvent } from '@/lib/site/analytics';
import { PROTOCOL, classifyHost } from '@/lib/hosts';

const TYPES = ['contact', 'inquiry', 'newsletter'];
const MAX_FIELDS = 20;
const MAX_LEN = 5000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// IP tidak disimpan: hash(IP + tanggal) dengan kunci rahasia server, berganti tiap hari.
const ipHash = (ip) => createHmac('sha256', process.env.PREVIEW_SECRET ?? 'dev').update(`${new Date().toISOString().slice(0, 10)}:${ip}`).digest('hex').slice(0, 32);

export async function verifyTurnstile(token, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST', body: new URLSearchParams({ secret, response: token, remoteip: ip }),
  });
  return (await res.json()).success === true;
}

async function notify(db, site, row) {
  const s = site.settings ?? {};
  let to = (s.form_recipients ?? []).filter((e) => EMAIL.test(e));
  if (!to.length) {
    const { data: owner } = await db.from('site_members').select('user_id').eq('site_id', site.id).eq('role', 'owner').single();
    const { data: p } = await db.from('profiles').select('email').eq('user_id', owner.user_id).single();
    to = [p.email];
  }
  const f = row.fields;
  const label = { contact: 'Pesan baru', inquiry: 'Permintaan penawaran', newsletter: 'Pendaftar newsletter' }[row.form_type];
  const text = Object.entries(f).map(([k, v]) => `${k}: ${v}`).join('\n') + `\n\nHalaman: ${row.page_path}\nBalas email ini untuk menjawab pengirim.`;
  await sendEmail({ to, subject: `${label} dari ${site.name}${f.name ? ` — ${f.name}` : ''}`, text, replyTo: f.email });
}

export async function handleContact(req, site, host) {
  const back = (path, params, hash) => {
    const url = new URL(`${PROTOCOL}://${host}${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    url.hash = hash;
    return Response.redirect(url, 303);
  };
  if (Number(req.headers.get('content-length') ?? 0) > 64 * 1024) return new Response('Payload terlalu besar', { status: 413 });

  const form = await req.formData();
  const type = TYPES.includes(form.get('form_type')) ? form.get('form_type') : 'contact';
  const rawReturn = String(form.get('return_to') ?? '/');
  const returnTo = /^\/(?!\/)[^\s]*$/.test(rawReturn) ? rawReturn.split('?')[0] : '/';
  const fail = (msg) => back(returnTo, { form_type: type, form_error: msg }, `${type}_form`);

  const fields = {};
  for (const [k, v] of form.entries()) {
    const m = /^contact\[([\w-]{1,40})\]$/.exec(k);
    if (m && typeof v === 'string' && Object.keys(fields).length < MAX_FIELDS) fields[m[1]] = v.trim().slice(0, MAX_LEN);
  }
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const hash = ipHash(ip);
  const db = createAdminClient();
  const honeypot = !!fields.website;
  delete fields.website;

  if (!honeypot) {
    if (!EMAIL.test(fields.email ?? '')) return fail('Isi email yang valid.');
    if (type !== 'newsletter' && !fields.body) return fail('Isi pesan Anda.');
    if (classifyHost(host).slug && !(await verifyTurnstile(form.get('cf-turnstile-response'), ip))) return fail('Verifikasi anti-spam gagal. Coba lagi.');
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await db.from('form_submissions').select('id', { count: 'exact', head: true }).eq('site_id', site.id).eq('ip_hash', hash).gte('created_at', since);
    if (count >= 5) return fail('Terlalu banyak kiriman. Coba lagi dalam beberapa menit.');
  }

  const productId = String(form.get('product_id') ?? '');
  const row = {
    site_id: site.id, form_type: type, fields, ip_hash: hash, page_path: returnTo,
    locale: String(form.get('locale') ?? '').slice(0, 5) || null,
    product_id: /^[0-9a-f-]{36}$/.test(productId) ? productId : null,
    status: honeypot ? 'spam' : 'new',
  };
  const { error } = await db.from('form_submissions').insert(row);
  if (error) {
    console.error('[contact]', error.message);
    return fail('Pesan gagal dikirim. Coba lagi.');
  }
  // Bot honeypot tetap melihat "berhasil" agar tidak mencoba ulang.
  if (!honeypot) {
    trackEvent(req, site, host, { type: 'event', name: 'form_submit', path: returnTo, props: { form: type } });
    await notify(db, site, row).catch((e) => console.error('[contact:email]', e.message));
  }
  return back(returnTo, { form_type: type, contact_posted: 'true' }, `${type}_form`);
}
