-- Fase 1 — Konten & file (PRD §4.5, §4.7, §4.8, §4.11): file, produk, koleksi, blog & artikel, form, redirect, pencarian, kuota.

-- ---------------------------------------------------------------- file manager
-- Objek di Storage: site-files/<site_id>/<uuid>/<nama> (+ varian WebP <lebar>.webp di folder yang sama).
create table files (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  folder text not null default '' check (folder ~ '^([a-z0-9][a-z0-9 _-]*(/[a-z0-9][a-z0-9 _-]*)*)?$'),
  name text not null check (length(name) between 1 and 200 and name !~ '[/\\]'),
  storage_path text not null,
  mime text not null,
  size bigint not null,
  width int,
  height int,
  variants jsonb not null default '{}',      -- { "400": "<path>", "800": ..., } (WebP)
  alt text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  unique (site_id, folder, name)
);
create index on files (site_id, created_at desc);

-- ---------------------------------------------------------------- produk & koleksi
-- array_to_string bawaan tidak immutable → tidak bisa dipakai di kolom generated.
create function tags_text(text[]) returns text language sql immutable parallel safe as $$ select array_to_string($1, ' ') $$;

create table products (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  handle text not null check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  summary text not null default '',
  body text not null default '',
  media uuid[] not null default '{}',        -- files.id (gambar/video), urutan = urutan galeri
  specs jsonb not null default '[]',         -- [{ "label", "value" }]
  price_label text not null default '',
  tags text[] not null default '{}',
  downloads uuid[] not null default '{}',    -- files.id (brosur/datasheet)
  cta jsonb not null default '{"type":"inquiry"}', -- { type: whatsapp|inquiry|link, label?, url? }
  related_ids uuid[] not null default '{}',
  template_suffix text check (template_suffix ~ '^[a-z0-9_-]+$'),
  seo jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('simple', title), 'A') ||
    setweight(to_tsvector('simple', summary || ' ' || tags_text(tags)), 'B') ||
    setweight(to_tsvector('simple', regexp_replace(body, '<[^>]+>', ' ', 'g')), 'C')) stored,
  unique (site_id, handle)
);
create index on products using gin (search);

create table collections (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  handle text not null check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and handle <> 'all'),
  title text not null,
  body text not null default '',
  image uuid references files (id) on delete set null,
  rule text not null default 'manual' check (rule in ('manual', 'tag')),
  rule_tag text,                             -- rule = 'tag': produk dengan tag ini
  sort text not null default 'manual' check (sort in ('manual', 'title', 'newest')),
  seo jsonb not null default '{}',
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (site_id, handle),
  check (rule = 'manual' or rule_tag is not null)
);

create table collection_products (
  collection_id uuid not null references collections (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  position int not null default 0,
  primary key (collection_id, product_id)
);

-- ---------------------------------------------------------------- blog
create table blogs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  handle text not null check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  unique (site_id, handle)
);

create table articles (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  blog_id uuid not null references blogs (id) on delete cascade,
  handle text not null check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  excerpt text not null default '',
  body text not null default '',
  cover uuid references files (id) on delete set null,
  author text not null default '',
  tags text[] not null default '{}',
  seo jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('simple', title), 'A') ||
    setweight(to_tsvector('simple', excerpt || ' ' || tags_text(tags)), 'B') ||
    setweight(to_tsvector('simple', regexp_replace(body, '<[^>]+>', ' ', 'g')), 'C')) stored,
  unique (blog_id, handle)
);
create index on articles (site_id, published_at desc);
create index on articles using gin (search);

-- Artikel harus satu situs dengan blog-nya.
create function articles_site() returns trigger language plpgsql as $$
begin
  select site_id into new.site_id from blogs where id = new.blog_id;
  return new;
end $$;
create trigger articles_site before insert or update of blog_id on articles for each row execute function articles_site();

alter table pages add column search tsvector generated always as (
  setweight(to_tsvector('simple', title), 'A') ||
  setweight(to_tsvector('simple', regexp_replace(body, '<[^>]+>', ' ', 'g')), 'C')) stored;
create index on pages using gin (search);

-- ---------------------------------------------------------------- form & redirect
-- Diisi endpoint publik /contact (service role); anggota situs membaca & mengelola.
create table form_submissions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  form_type text not null check (form_type in ('contact', 'inquiry', 'newsletter')),
  fields jsonb not null,
  product_id uuid references products (id) on delete set null,
  locale text,
  page_path text,
  ip_hash text,                              -- hash(IP + salt harian): rate limit, IP tidak disimpan
  status text not null default 'new' check (status in ('new', 'read', 'done', 'spam')),
  note text not null default '',
  created_at timestamptz not null default now()
);
create index on form_submissions (site_id, created_at desc);
create index on form_submissions (site_id, ip_hash, created_at);

create table redirects (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  from_path text not null check (from_path ~ '^/[^?#\s]*$'),
  to_url text not null check (to_url ~ '^(/|https?://)'),
  hits int not null default 0,
  created_at timestamptz not null default now(),
  unique (site_id, from_path)
);

-- ---------------------------------------------------------------- kuota (PRD §8.3) — dicek di DB, bukan hanya di UI
create function plan_limit(p_site uuid, p_key text) returns bigint language sql stable security definer set search_path = public as $$
  select (p.limits ->> p_key)::bigint from sites s join plans p on p.id = s.plan_id where s.id = p_site
$$;

create function enforce_quota() returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_key text := tg_argv[0];
  v_limit bigint := plan_limit(new.site_id, v_key);
  v_used bigint;
begin
  if v_limit is null then return new; end if;
  if v_key = 'storage_mb' then
    select coalesce(sum(size), 0) + new.size into v_used from files where site_id = new.site_id;
    if v_used > v_limit * 1024 * 1024 then raise exception 'Kuota storage % MB sudah penuh.', v_limit; end if;
  else
    execute format('select count(*) from %I where site_id = $1', tg_table_name) into v_used using new.site_id;
    if v_used >= v_limit then raise exception 'Batas % % tercapai.', v_limit, v_key; end if;
  end if;
  return new;
end $$;
create trigger pages_quota before insert on pages for each row execute function enforce_quota('pages');
create trigger products_quota before insert on products for each row execute function enforce_quota('products');
create trigger articles_quota before insert on articles for each row execute function enforce_quota('articles');
create trigger files_quota before insert on files for each row execute function enforce_quota('storage_mb');

-- ---------------------------------------------------------------- RLS: semua anggota situs (termasuk editor) mengelola konten
alter table files enable row level security;
alter table products enable row level security;
alter table collections enable row level security;
alter table collection_products enable row level security;
alter table blogs enable row level security;
alter table articles enable row level security;
alter table form_submissions enable row level security;
alter table redirects enable row level security;

create policy files_all on files for all using (has_site_role(site_id)) with check (has_site_role(site_id));
create policy products_all on products for all using (has_site_role(site_id)) with check (has_site_role(site_id));
create policy collections_all on collections for all using (has_site_role(site_id)) with check (has_site_role(site_id));
create policy collection_products_all on collection_products for all
  using (exists (select 1 from collections c where c.id = collection_id and has_site_role(c.site_id)))
  with check (exists (select 1 from collections c join products p on p.site_id = c.site_id
                      where c.id = collection_id and p.id = product_id and has_site_role(c.site_id)));
create policy blogs_all on blogs for all using (has_site_role(site_id)) with check (has_site_role(site_id));
create policy articles_all on articles for all using (has_site_role(site_id)) with check (has_site_role(site_id));
-- Kiriman form hanya masuk lewat service role; anggota membaca, mengubah status/catatan, menghapus.
create policy forms_read on form_submissions for select using (has_site_role(site_id));
create policy forms_update on form_submissions for update using (has_site_role(site_id)) with check (has_site_role(site_id));
create policy forms_delete on form_submissions for delete using (has_site_role(site_id));
create policy redirects_all on redirects for all using (has_site_role(site_id)) with check (has_site_role(site_id));

-- Hitung kunjungan redirect (dipanggil render situs, service role).
create function hit_redirect(p_id uuid) returns void language sql security definer set search_path = public as $$
  update redirects set hits = hits + 1 where id = p_id
$$;
revoke execute on function hit_redirect from anon, authenticated;

-- ---------------------------------------------------------------- Storage: bucket publik site-files/<site_id>/...
insert into storage.buckets (id, name, public) values ('site-files', 'site-files', true) on conflict (id) do nothing;
create policy site_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'site-files' and has_site_role(((storage.foldername(name))[1])::uuid));
create policy site_files_update on storage.objects for update to authenticated
  using (bucket_id = 'site-files' and has_site_role(((storage.foldername(name))[1])::uuid));
create policy site_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-files' and has_site_role(((storage.foldername(name))[1])::uuid));

-- ---------------------------------------------------------------- situs baru: + blog Berita, halaman Kontak dengan form
-- Buat situs baru: situs + owner + salinan theme bawaan + halaman & menu awal. Mengembalikan id situs.
create or replace function create_site(p_name text, p_slug text, p_industry text default 'umum', p_locale text default 'id', p_theme text default 'lumen')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_site uuid;
  v_src themes;
  v_theme uuid;
  v_slug text := lower(trim(p_slug));
begin
  if v_user is null then raise exception 'Harus login.'; end if;
  if is_reserved_slug(v_slug) then raise exception 'Alamat "%" tidak bisa dipakai.', v_slug; end if;
  select * into v_src from themes where site_id is null and builtin_key = p_theme;
  if not found then raise exception 'Theme % tidak ditemukan.', p_theme; end if;

  insert into sites (name, slug, industry, default_locale, locales)
  values (trim(p_name), v_slug, p_industry, p_locale, array[p_locale]) returning id into v_site;
  insert into site_members (site_id, user_id, role) values (v_site, v_user, 'owner');

  insert into themes (site_id, name, source, builtin_key, based_on_id, builtin_version)
  values (v_site, v_src.name, 'builtin', v_src.builtin_key, v_src.id, v_src.builtin_version) returning id into v_theme;
  insert into theme_files (theme_id, key, content, storage_path, checksum, size, updated_by)
  select v_theme, key, content, storage_path, checksum, size, v_user from theme_files where theme_id = v_src.id;
  update sites set live_theme_id = v_theme where id = v_site;

  insert into pages (site_id, handle, title, body, status, published_at) values
    (v_site, 'tentang-kami', 'Tentang Kami', '<p>Ceritakan sejarah, visi, dan misi ' || trim(p_name) || ' di sini.</p>', 'published', now()),
    (v_site, 'kontak', 'Kontak', '<p>Hubungi kami untuk informasi lebih lanjut.</p>', 'published', now());
  update pages set template_suffix = 'contact' where site_id = v_site and handle = 'kontak'
    and exists (select 1 from theme_files where theme_id = v_theme and key = 'templates/page.contact.json');
  insert into blogs (site_id, handle, title) values (v_site, 'berita', 'Berita');
  insert into menus (site_id, handle, title, items) values
    (v_site, 'main-menu', 'Menu utama', '[{"title":"Beranda","url":"/"},{"title":"Produk","url":"/collections/all"},{"title":"Tentang Kami","url":"/pages/tentang-kami"},{"title":"Berita","url":"/blogs/berita"},{"title":"Kontak","url":"/pages/kontak"}]'),
    (v_site, 'footer', 'Footer', '[{"title":"Tentang Kami","url":"/pages/tentang-kami"},{"title":"Kontak","url":"/pages/kontak"}]');

  perform log_audit(v_site, 'site.create', jsonb_build_object('slug', v_slug, 'theme', p_theme));
  return v_site;
end $$;

