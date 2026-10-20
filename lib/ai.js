// AI generator konten (PRD §4.2.1). Server saja; tanpa ANTHROPIC_API_KEY semua pemanggil jatuh ke preset.
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '@/lib/supabase/server';

const SITE_MODEL = 'claude-sonnet-5-5';
const LANG = { id: 'Bahasa Indonesia', en: 'English' };

// JSON schema ketat untuk structured output.
const S = { type: 'string' };
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const arr = (items) => ({ type: 'array', items });
const PAGE = obj({ title: S, body: { type: 'string', description: 'HTML sederhana: <p>, <h2>, <ul><li>' } });
const CONTENT = obj({
  tagline: S,
  hero: obj({ kicker: { type: 'string', description: '1–3 kata' }, heading: S, text: S, cta: { type: 'string', description: 'label tombol, 1–3 kata' } }),
  about: obj({ heading: S, text: S }),
  services: obj({ heading: S, items: arr(obj({ title: S, text: S })) }),
  stats: arr(obj({ value: S, label: S })),
  faq: arr(obj({ question: S, answer: S })),
  cta: obj({ heading: S, text: S, button: S }),
  about_page: PAGE,
  contact_page: PAGE,
  collection: { type: 'string', description: 'nama daftar produk/layanan, mis. "Produk" atau "Layanan"' },
  products: arr(obj({ title: S, summary: S, price: { type: 'string', description: 'label harga, mis. "Hubungi kami"' }, specs: arr(obj({ label: S, value: S })) })),
  articles: arr(obj({ title: S, excerpt: S, body: { type: 'string', description: 'HTML: 2–4 paragraf <p>' } })),
});

const filled = (v, max = 400) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const between = (a, lo, hi) => Array.isArray(a) && a.length >= lo && a.length <= hi;

/** Hasil AI → bentuk konten preset; bagian yang tidak valid diambil dari preset (PRD §4.2.1). */
export function fromAi(a, p) {
  const pick = (ok, v) => (ok ? v : undefined);
  const out = {
    tagline: pick(filled(a.tagline, 200), a.tagline),
    hero: pick(filled(a.hero?.heading, 120) && filled(a.hero?.text) && filled(a.hero?.cta, 40), { kicker: a.hero.kicker?.slice(0, 40) ?? '', heading: a.hero.heading, text: a.hero.text, cta: a.hero.cta }),
    about: pick(filled(a.about?.heading, 120) && filled(a.about?.text, 800), a.about),
    services: pick(filled(a.services?.heading, 120) && between(a.services?.items, 3, 6) && a.services.items.every((i) => filled(i.title, 80) && filled(i.text)), { heading: a.services?.heading, items: a.services?.items.map((i) => [i.title, i.text]) }),
    stats: pick(between(a.stats, 3, 4) && a.stats.every((s) => filled(s.value, 20) && filled(s.label, 60)), a.stats?.map((s) => [s.value, s.label])),
    faq: pick(between(a.faq, 3, 6) && a.faq.every((f) => filled(f.question, 200) && filled(f.answer, 800)), a.faq?.map((f) => [f.question, f.answer])),
    cta: pick(filled(a.cta?.heading, 120) && filled(a.cta?.text) && filled(a.cta?.button, 40), a.cta),
    collection: pick(filled(a.collection, 40), a.collection),
    products: pick(between(a.products, 3, 6) && a.products.every((x) => filled(x.title, 120) && filled(x.summary)), a.products?.map((x) => ({ ...x, specs: (x.specs ?? []).slice(0, 6).map((s) => [s.label, s.value]) }))),
    articles: pick(between(a.articles, 2, 2) && a.articles.every((x) => filled(x.title, 160) && filled(x.body, 6000)), a.articles),
  };
  const page = (v, fb) => (filled(v?.title, 80) && filled(v?.body, 6000) ? v : fb);
  return {
    ...Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v ?? p[k]])),
    pages: { 'tentang-kami': page(a.about_page, p.pages['tentang-kami']), kontak: page(a.contact_page, p.pages.kontak), 'kebijakan-privasi': p.pages['kebijakan-privasi'] },
  };
}

async function log(row) {
  await createAdminClient().from('ai_generations').insert(row);
}

/**
 * Generate konten situs dari deskripsi wizard. Mengembalikan { content: { [locale]: konten } } atau null (pakai preset).
 * Batas: `ai_site_per_day` per user per hari (plans.limits plan free).
 */
export async function generateSite({ supabase, siteId, userId, input, preset }) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const since = new Date(Date.now() - 864e5).toISOString();
  const [{ count }, { data: plan }] = await Promise.all([
    supabase.from('ai_generations').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'site').gte('created_at', since),
    supabase.from('plans').select('limits').eq('id', 'free').single(),
  ]);
  if (count >= (plan?.limits?.ai_site_per_day ?? 3)) return null;

  const locales = input.second ? [input.locale, input.locale === 'id' ? 'en' : 'id'] : [input.locale];
  const started = Date.now();
  const row = { site_id: siteId, user_id: userId, kind: 'site', model: SITE_MODEL };
  try {
    const client = new Anthropic({ timeout: 60_000, maxRetries: 0 });
    const res = await client.beta.messages.create({
      model: SITE_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: obj(Object.fromEntries(locales.map((l) => [l, CONTENT]))) } },
      system: 'Kamu copywriter website company profile untuk bisnis di Indonesia. Tulis teks yang spesifik untuk company ini, jujur, dan tanpa klaim yang tidak bisa dibuktikan: angka statistik yang tidak disebut di deskripsi tulis sebagai perkiraan yang wajar dan umum. Bahasa jelas, kalimat pendek, nada profesional. Jangan menulis data kontak atau harga pasti yang tidak diberikan.',
      messages: [{
        role: 'user',
        content: `Data company:\n- Nama: ${input.name}\n- Industri: ${input.industry}\n- Deskripsi: ${input.description.slice(0, 2000)}\n\n`
          + `Tulis konten website dalam ${locales.map((l) => `${LANG[l]} (kunci "${l}")`).join(' dan ')}; isi tiap bahasa sama maknanya. `
          + '3–6 layanan, 3–4 statistik, 3–6 FAQ, 3–6 produk/layanan, tepat 2 artikel pembuka.\n\n'
          + `Contoh gaya dan panjang (preset industri, jangan disalin):\n${JSON.stringify(preset[input.locale]).slice(0, 6000)}`,
      }],
    });
    Object.assign(row, { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens, duration_ms: Date.now() - started });
    const text = res.stop_reason === 'end_turn' ? res.content.find((b) => b.type === 'text')?.text : null;
    if (!text) throw new Error(`stop_reason ${res.stop_reason}`);
    const data = JSON.parse(text);
    const content = Object.fromEntries(locales.map((l) => [l, fromAi(data[l] ?? {}, preset[l])]));
    await log({ ...row, status: 'ok' });
    return { content };
  } catch (e) {
    console.error('ai generateSite', e.message);
    await log({ ...row, duration_ms: Date.now() - started, status: 'fallback' });
    return null;
  }
}
