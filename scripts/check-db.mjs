// Uji migrasi (RLS, RPC create_site/accept_invite, trigger) di PGlite dengan stub skema auth Supabase. Jalankan: npm run check
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated; grant all on storage.objects to authenticated;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  -- Sama dengan default Supabase: tabel baru di public otomatis di-grant ke anon & authenticated.
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`);
const dir = new URL('../supabase/migrations/', import.meta.url);
for (const f of readdirSync(dir).sort()) {
  try { await db.exec(readFileSync(new URL(f, dir), 'utf8')); }
  catch (e) { console.error(`${f}: ${e.message}`); process.exit(1); }
}

const U = { owner: '00000000-0000-0000-0000-00000000000a', editor: '00000000-0000-0000-0000-00000000000b', other: '00000000-0000-0000-0000-00000000000c' };
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
    ('${U.owner}','owner@example.com','{"name":"Owner"}'), ('${U.editor}','editor@example.com','{}'), ('${U.other}','other@example.com','{}');
  insert into themes (id, name, source, builtin_key, builtin_version) values ('20000000-0000-0000-0000-000000000001','Lumen','builtin','lumen',1);
  insert into theme_files (theme_id, key, content) values
    ('20000000-0000-0000-0000-000000000001','layout/theme.liquid','{{ content_for_layout }}'),
    ('20000000-0000-0000-0000-000000000001','templates/index.json','{"sections":{},"order":[]}');
`);

// Jalankan fn sebagai user (RLS aktif). Error dikembalikan sebagai pesan, bukan dilempar.
async function as(user, sql, params) {
  await db.exec(`set role authenticated; select set_config('request.jwt.sub', '${user ?? ''}', false);`);
  try { return await db.query(sql, params); }
  catch (e) { return { error: e.message }; }
  finally { await db.exec('reset role;'); }
}
const rows = async (...a) => { const r = await as(...a); assert.ok(!r.error, r.error); return r.rows; };

// Profil otomatis
assert.equal((await db.query(`select name from profiles where user_id = $1`, [U.owner])).rows[0].name, 'Owner');
assert.equal((await db.query(`select name from profiles where user_id = $1`, [U.editor])).rows[0].name, 'editor');

// create_site: slug cadangan & format ditolak; berhasil menyalin theme + halaman + menu
assert.match((await as(U.owner, `select create_site('X', 'app')`)).error, /tidak bisa dipakai/);
assert.ok((await as(U.owner, `select create_site('X', 'Bad Slug!')`)).error);
const [{ create_site: site }] = await rows(U.owner, `select create_site('Acme', 'acme')`);
assert.ok((await as(U.owner, `select create_site('Acme 2', 'acme')`)).error, 'slug unik');
const [s] = await rows(U.owner, `select s.*, t.site_id as theme_site from sites s join themes t on t.id = s.live_theme_id where s.id = $1`, [site]);
assert.equal(s.theme_site, site);
assert.equal(s.status, 'draft');
assert.equal((await rows(U.owner, `select count(*)::int n from theme_files f join themes t on t.id = f.theme_id where t.site_id = $1`, [site]))[0].n, 2);
assert.equal((await rows(U.owner, `select count(*)::int n from pages where site_id = $1`, [site]))[0].n, 2);
assert.equal((await rows(U.owner, `select count(*)::int n from audit_logs where site_id = $1`, [site]))[0].n, 1);

// Versi theme naik saat file disimpan
const v0 = (await db.query(`select version from themes where id = $1`, [s.live_theme_id])).rows[0].version;
await rows(U.owner, `update theme_files set content = 'x' where theme_id = $1 and key = 'layout/theme.liquid'`, [s.live_theme_id]);
assert.equal((await db.query(`select version from themes where id = $1`, [s.live_theme_id])).rows[0].version, v0 + 1);

// Orang luar tidak melihat apa pun dari situs
assert.equal((await rows(U.other, `select * from sites`)).length, 0);
assert.equal((await rows(U.other, `select * from pages`)).length, 0);
assert.equal((await rows(U.other, `select f.* from theme_files f join themes t on t.id = f.theme_id where t.site_id is not null`)).length, 0);
assert.equal((await rows(U.other, `select * from themes where site_id is null`)).length, 1, 'theme bawaan terlihat');
assert.equal((await as(null, `select * from themes`)).rows.length, 0, 'anon tidak melihat theme');

// Undangan: email harus cocok; editor bergabung
await rows(U.owner, `insert into site_invites (site_id, email, role, token) values ($1, 'editor@example.com', 'editor', 'tok-1')`, [site]);
assert.equal((await rows(U.editor, `select * from site_invites`)).length, 0, 'calon anggota tidak melihat undangan');
assert.match((await as(U.other, `select accept_invite('tok-1')`)).error, /Undangan ini untuk/);
await rows(U.editor, `select accept_invite('tok-1')`);
assert.match((await as(U.editor, `select accept_invite('tok-1')`)).error, /kedaluwarsa/);
assert.ok((await as(U.owner, `insert into site_invites (site_id, email, role) values ($1, 'x@example.com', 'owner')`, [site])).error, 'tidak bisa undang owner');

// Editor: konten boleh, theme/situs/anggota tidak
await rows(U.editor, `insert into pages (site_id, handle, title) values ($1, 'layanan', 'Layanan')`, [site]);
assert.equal((await rows(U.editor, `update sites set name = 'Hack' where id = $1 returning id`, [site])).length, 0);
assert.equal((await rows(U.editor, `update theme_files set content = 'x' where theme_id = $1 returning id`, [s.live_theme_id])).length, 0);
assert.equal((await rows(U.editor, `update site_members set role = 'admin' where user_id = $1 returning 1`, [U.editor])).length, 0);
assert.equal((await rows(U.editor, `select * from audit_logs`)).length, 0);
assert.equal((await rows(U.editor, `select * from profiles`)).length, 2, 'sesama anggota terlihat');

// Owner: tidak bisa mengubah kolom platform; tidak bisa dihapus/diturunkan; user tidak bisa jadi platform admin
assert.match((await as(U.owner, `update sites set show_badge = false where id = $1`, [site])).error, /platform admin/);
assert.match((await as(U.owner, `update sites set status = 'suspended' where id = $1`, [site])).error, /disuspend/);
await rows(U.owner, `update sites set status = 'published' where id = $1`, [site]);
assert.equal((await rows(U.owner, `delete from site_members where user_id = $1 returning 1`, [U.owner])).length, 0);
assert.ok((await as(U.owner, `update profiles set is_platform_admin = true where user_id = $1`, [U.owner])).error);
await rows(U.owner, `update profiles set name = 'Pemilik' where user_id = $1`, [U.owner]);

// Owner menghapus editor
assert.equal((await rows(U.owner, `delete from site_members where user_id = $1 returning 1`, [U.editor])).length, 1);
assert.equal((await rows(U.editor, `select * from pages`)).length, 0);

// ---------------------------------------------------------------- Fase 1: konten
await db.query(`insert into site_members (site_id, user_id, role) values ($1, $2, 'editor')`, [site, U.editor]);
const [{ id: prod }] = await rows(U.editor, `insert into products (site_id, handle, title, summary, body, tags) values ($1, 'baja-ringan', 'Baja Ringan C75', 'Rangka atap', '<p>Tahan <b>karat</b></p>', '{atap,sni}') returning id`, [site]);
assert.equal((await rows(U.editor, `select id from products where search @@ websearch_to_tsquery('simple', 'karat')`)).length, 1, 'FTS body tanpa tag HTML');
assert.equal((await rows(U.editor, `select id from products where search @@ websearch_to_tsquery('simple', 'sni')`)).length, 1, 'FTS tag');
const [{ id: col }] = await rows(U.editor, `insert into collections (site_id, handle, title) values ($1, 'atap', 'Atap') returning id`, [site]);
await rows(U.editor, `insert into collection_products (collection_id, product_id) values ($1, $2)`, [col, prod]);
assert.ok((await as(U.editor, `insert into collections (site_id, handle, title) values ($1, 'all', 'X')`, [site])).error, 'handle all dicadangkan');
const [{ id: blog }] = await rows(U.editor, `select id from blogs where site_id = $1 and handle = 'berita'`, [site]);
const [art] = await rows(U.editor, `insert into articles (site_id, blog_id, handle, title) values ($1, $2, 'halo', 'Halo') returning site_id`, [site, blog]);
assert.equal(art.site_id, site);
await rows(U.editor, `insert into redirects (site_id, from_path, to_url) values ($1, '/lama', '/pages/tentang-kami')`, [site]);
assert.ok((await as(U.editor, `insert into redirects (site_id, from_path, to_url) values ($1, 'lama', 'javascript:alert(1)')`, [site])).error);

// Form: hanya service role yang menulis; anggota membaca & mengubah status
assert.ok((await as(U.editor, `insert into form_submissions (site_id, form_type, fields) values ($1, 'contact', '{}')`, [site])).error);
await db.query(`insert into form_submissions (site_id, form_type, fields) values ($1, 'contact', '{"name":"Budi"}')`, [site]);
assert.equal((await rows(U.editor, `update form_submissions set status = 'read' returning id`)).length, 1);
assert.equal((await rows(U.other, `select * from form_submissions`)).length, 0);
assert.equal((await rows(U.other, `select * from products`)).length, 0);

// Storage: hanya anggota yang boleh menulis ke folder situsnya
await rows(U.editor, `insert into storage.objects (bucket_id, name) values ('site-files', $1)`, [`${site}/x/a.png`]);
assert.ok((await as(U.other, `insert into storage.objects (bucket_id, name) values ('site-files', $1)`, [`${site}/x/b.png`])).error);

// Kuota: storage & jumlah halaman
await db.query(`update plans set limits = limits || '{"storage_mb":1,"pages":4}'`);
await rows(U.editor, `insert into files (site_id, name, storage_path, mime, size) values ($1, 'a.jpg', 'p', 'image/jpeg', 800000)`, [site]);
assert.match((await as(U.editor, `insert into files (site_id, name, storage_path, mime, size) values ($1, 'b.jpg', 'p', 'image/jpeg', 400000)`, [site])).error, /Kuota storage/);
await rows(U.editor, `insert into pages (site_id, handle, title) values ($1, 'p4', 'P4')`, [site]);
assert.match((await as(U.editor, `insert into pages (site_id, handle, title) values ($1, 'p5', 'P5')`, [site])).error, /Batas 4 pages/);

// Pengerasan: audit hanya untuk situs sendiri; RPC sistem tidak bisa dipanggil user
assert.match((await as(U.other, `select log_audit($1, 'palsu')`, [site])).error, /Tidak berhak/);
await rows(U.owner, `select log_audit($1, 'ok')`, [site]);
assert.ok((await as(U.owner, `select hit_redirect(gen_random_uuid())`)).error, 'hit_redirect hanya service role');
assert.ok((await as(null, `select create_site('X', 'anon-site')`)).error, 'anon tidak bisa create_site');

// ---------------------------------------------------------------- Fase 2: editor & theme library
const live = s.live_theme_id;
const [{ save_theme_json: t1 }] = await rows(U.editor, `select save_theme_json($1, 'templates/index.json', '{"sections":{},"order":[]}')`, [live]);
assert.ok(t1, 'editor boleh simpan template JSON');
assert.match((await as(U.editor, `select save_theme_json($1, 'layout/theme.liquid', 'x')`, [live])).error, /tidak bisa diubah/);
assert.ok((await as(U.editor, `select save_theme_json($1, 'templates/index.json', '{rusak')`, [live])).error, 'JSON harus valid');
assert.match((await as(U.editor, `select save_theme_json($1, 'templates/index.json', '{}', now() - interval '1 hour')`, [live])).error, /KONFLIK/);
await rows(U.editor, `select save_theme_json($1, 'templates/page.faq.json', '{"sections":{},"order":[]}')`, [live]);
assert.match((await as(U.other, `select save_theme_json($1, 'templates/index.json', '{}')`, [live])).error, /Tidak berhak/);

assert.match((await as(U.editor, `select copy_theme($1, $2, 'Salinan')`, [site, live])).error, /Tidak berhak/, 'editor tidak bisa duplikat');
const [{ copy_theme: dup }] = await rows(U.owner, `select copy_theme($1, $2, 'Salinan')`, [site, live]);
assert.equal((await rows(U.owner, `select count(*)::int n from theme_files where theme_id = $1`, [dup]))[0].n,
  (await rows(U.owner, `select count(*)::int n from theme_files where theme_id = $1`, [live]))[0].n);
await rows(U.owner, `update sites set live_theme_id = $2 where id = $1`, [site, dup]);
assert.match((await as(U.owner, `delete from themes where id = $1`, [dup])).error, /tidak bisa dihapus/);
assert.equal((await rows(U.owner, `delete from themes where id = $1 returning id`, [live])).length, 1, 'theme non-live bisa dihapus');
// Theme situs lain tidak bisa dijadikan live
const [{ create_site: site2 }] = await rows(U.other, `select create_site('Lain', 'lain')`);
const [{ live_theme_id: other }] = await db.query(`select live_theme_id from sites where id = $1`, [site2]).then((r) => r.rows);
assert.match((await as(U.owner, `update sites set live_theme_id = $2 where id = $1`, [site, other])).error, /bukan milik/);
assert.ok((await as(U.owner, `select copy_theme($1, $2, 'curian')`, [site, other])).error, 'tidak bisa menyalin theme situs lain');

await db.query(`delete from sites where id = $1`, [site2]); // cascade: theme live ikut terhapus bersama situsnya
assert.equal((await db.query(`select count(*)::int n from themes where site_id = $1`, [site2])).rows[0].n, 0);

// ---------------------------------------------------------------- Fase 3: versi file theme
const [{ id: layoutFile }] = await rows(U.owner, `select f.id from theme_files f where f.theme_id = $1 and key = 'layout/theme.liquid'`, [dup]);
for (let i = 0; i < 23; i++) await rows(U.owner, `update theme_files set content = $2 where id = $1`, [layoutFile, `v${i}`]);
const vers = await rows(U.owner, `select content from theme_file_versions where theme_file_id = $1 order by id desc`, [layoutFile]);
assert.equal(vers.length, 20, 'disimpan 20 versi terakhir');
assert.equal(vers[0].content, 'v21', 'versi terbaru = isi sebelum simpan terakhir');
assert.equal((await rows(U.editor, `select * from theme_file_versions`)).length, 0, 'editor tidak melihat riwayat kode');

// ---------------------------------------------------------------- Fase 4: tanda konten contoh & preset
await db.query(`update plans set limits = limits || '{"pages":100}'`);
const [{ id: samplePage }] = await rows(U.owner, `insert into pages (site_id, handle, title, sample) values ($1, 'contoh', 'Contoh', 'preset') returning id`, [site]);
await db.exec(`select set_config('request.jwt.sub', '', false)`);
await db.query(`update pages set title = 'Sistem' where id = $1`, [samplePage]); // tanpa user (service role): tanda tetap
assert.equal((await db.query(`select sample from pages where id = $1`, [samplePage])).rows[0].sample, 'preset');
await rows(U.editor, `update pages set title = 'Diedit' where id = $1`, [samplePage]);
assert.equal((await db.query(`select sample from pages where id = $1`, [samplePage])).rows[0].sample, null, 'edit user menghapus tanda contoh');
await db.query(`insert into industry_presets (key, name, data) values ('umum', 'Umum', '{}')`);
assert.equal((await rows(U.editor, `select key from industry_presets`)).length, 1, 'user login membaca preset');
assert.ok((await as(U.owner, `insert into industry_presets (key, name, data) values ('x', 'X', '{}')`)).error, 'hanya platform admin menulis preset');

// Terjemahan: anggota (termasuk editor) mengelola, bukan anggota tidak bisa.
await rows(U.editor, `insert into translations (site_id, locale, resource_type, resource_key, field, value) values ($1, 'en', 'page', $2, 'title', 'About')`, [site, samplePage]);
assert.ok((await as(U.editor, `insert into translations (site_id, locale, resource_type, resource_key, field, value) values ($1, 'en', 'page', $2, 'title', 'Dup')`, [site, samplePage])).error, 'unik per field');
assert.ok((await as(U.other, `insert into translations (site_id, locale, resource_type, resource_key, field, value) values ($1, 'en', 'page', 'x', 'title', 'x')`, [site])).error);
assert.equal((await rows(U.other, `select * from translations`)).length, 0);

// Domain: user hanya menambah (pending) & menghapus; status diatur server; kuota; domain utama harus aktif milik situs.
await db.query(`update plans set limits = limits || '{"custom_domains":2}'`);
const [{ id: dom1 }] = await rows(U.owner, `insert into domains (site_id, hostname) values ($1, 'acme.co.id') returning id`, [site]);
assert.ok((await as(U.owner, `insert into domains (site_id, hostname, status) values ($1, 'palsu.co.id', 'active')`, [site])).error, 'status aktif tidak bisa diisi user');
assert.ok((await as(U.editor, `insert into domains (site_id, hostname) values ($1, 'editor.co.id')`, [site])).error, 'editor tidak mengelola domain');
assert.equal((await rows(U.owner, `update domains set status = 'active' where id = $1 returning id`, [dom1])).length, 0, 'user tidak bisa ubah status');
await rows(U.owner, `insert into domains (site_id, hostname) values ($1, 'www.acme.co.id')`, [site]);
assert.match((await as(U.owner, `insert into domains (site_id, hostname) values ($1, 'ketiga.co.id')`, [site])).error, /Batas 2 custom domain/);
assert.match((await as(U.owner, `update sites set primary_domain_id = $2 where id = $1`, [site, dom1])).error, /harus custom domain aktif/);
await db.query(`update domains set status = 'active' where id = $1`, [dom1]); // server (service role)
await rows(U.owner, `update sites set primary_domain_id = $2 where id = $1`, [site, dom1]);
assert.equal((await rows(U.owner, `delete from domains where id = $1 returning id`, [dom1])).length, 1);

// Analytics: agregasi harian, bounce/durasi, sumber per kunjungan, laporan hanya untuk anggota.
const ev = (min, type, name, path, visitor, extra = {}) => db.query(
  `insert into analytics_events (site_id, ts, type, name, path, visitor_hash, referrer_host, props) values ($1, now() - make_interval(mins => $2), $3, $4, $5, $6, $7, $8)`,
  [site, min, type, name, path, visitor, extra.ref ?? null, extra.props ?? {}]);
await ev(30, 'pageview', 'pageview', '/', 'v1', { ref: 'google.com' });
await ev(28, 'pageview', 'pageview', '/products/atap', 'v1', { props: { product: 'atap' } });
await ev(27, 'event', 'whatsapp', '/products/atap', 'v1');
await ev(10, 'pageview', 'pageview', '/', 'v2');
const today = (await db.query(`select (now() at time zone 'Asia/Jakarta')::date d`)).rows[0].d;
const rep = await rows(U.editor, `select * from analytics_report($1, $2, $2)`, [site, today]);
const get = (dim, val = '') => rep.find((r) => r.dimension === dim && r.value === val);
assert.deepEqual([get('total').visitors, get('total').pageviews, get('total').events, get('total').bounces], [2, 3, 1, 1]);
assert.equal(Number(get('total').duration_s), 180, 'durasi = selisih event pertama & terakhir per pengunjung');
assert.equal(get('source', 'google.com').visitors, 1);
assert.equal(get('source', 'google.com').pageviews, 2, 'pageview lanjutan ikut sumber kunjungan');
assert.equal(get('conversion', 'google.com').events, 1);
assert.equal(get('product', 'atap').pageviews, 1);
assert.ok((await as(U.other, `select * from analytics_report($1, $2, $2)`, [site, today])).error, 'bukan anggota ditolak');
await ev(2, 'event', 'scroll', '/', 'v3');
assert.equal((await rows(U.owner, `select analytics_realtime($1) n`, [site]))[0].n, 1);
assert.equal((await rows(U.other, `select * from analytics_events`)).length, 0, 'event mentah tidak bisa dibaca');
await db.query(`select analytics_rollup($1)`, [today]);
assert.equal((await rows(U.owner, `select * from analytics_report($1, $2, $2)`, [site, today])).filter((r) => r.dimension === 'total').length, 1, 'tidak dobel setelah rollup');

console.log('check-db: OK');
