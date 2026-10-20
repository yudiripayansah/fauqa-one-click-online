-- Fase 0 — Fondasi (PRD §8.1): profil, plan, situs & anggota, undangan, domain, theme & file theme, halaman, menu, audit.
-- Otorisasi di database (RLS). Situs publik dirender server-side dengan service role (bypass RLS), hanya data `published`.

-- ---------------------------------------------------------------- profil & plan
create table profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  email text not null default '',
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Profil otomatis untuk setiap user baru (nama dari metadata pendaftaran).
create function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), lower(coalesce(new.email, '')));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create table plans (
  id text primary key,
  name text not null,
  limits jsonb not null
);
insert into plans values ('free', 'Free', '{"storage_mb":1024,"pages":100,"products":500,"articles":500,"themes":10,"locales":2,"custom_domains":2,"members":5,"ai_site_per_day":3,"ai_text_per_day":50}');

-- ---------------------------------------------------------------- situs
create table sites (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$'),
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished', 'suspended')),
  suspended_reason text,
  industry text not null default 'umum',
  default_locale text not null default 'id' check (default_locale in ('id', 'en')),
  locales text[] not null default '{id}',
  live_theme_id uuid,
  primary_domain_id uuid,
  plan_id text not null default 'free' references plans (id),
  settings jsonb not null default '{}',
  password_hash text,
  show_badge boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table site_members (
  site_id uuid not null references sites (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor')),
  created_at timestamptz not null default now(),
  primary key (site_id, user_id)
);
create index on site_members (user_id);
-- Tepat satu owner per situs.
create unique index site_members_one_owner on site_members (site_id) where role = 'owner';

create table site_invites (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  email text not null check (email = lower(email)),
  role text not null check (role in ('admin', 'editor')),
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  invited_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (site_id, email)
);

-- Custom domain (§4.10). Subdomain platform tidak disimpan di sini: <slug>.<ROOT_DOMAIN> diturunkan dari sites.slug.
create table domains (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  hostname text not null unique check (hostname = lower(hostname)),
  type text not null default 'custom' check (type in ('platform', 'custom')),
  status text not null default 'pending_dns' check (status in ('pending_dns', 'verifying', 'active', 'misconfigured')),
  verification jsonb not null default '{}',
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);
create index on domains (site_id);
alter table sites add foreign key (primary_domain_id) references domains (id) on delete set null;

-- ---------------------------------------------------------------- theme
create table themes (
  id uuid primary key default gen_random_uuid(),
  site_id uuid references sites (id) on delete cascade,      -- null = theme bawaan
  name text not null,
  source text not null check (source in ('builtin', 'upload', 'duplicate')),
  builtin_key text,                                          -- 'lumen' | 'forge' | 'aura'
  based_on_id uuid references themes (id) on delete set null,
  builtin_version int,
  version int not null default 1,                            -- naik tiap simpan file (kunci cache)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on themes (site_id);
create unique index themes_builtin_key on themes (builtin_key) where site_id is null;
alter table sites add foreign key (live_theme_id) references themes (id) on delete set null;

create table theme_files (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references themes (id) on delete cascade,
  key text not null check (key ~ '^(layout|templates|sections|snippets|assets|config|locales)/[A-Za-z0-9._-]+$'),
  content text,
  storage_path text,
  checksum text,
  size int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  unique (theme_id, key),
  check ((content is null) <> (storage_path is null))
);

-- Setiap perubahan file theme menaikkan versi theme (cache file & render memakai versi ini).
create function bump_theme_version() returns trigger language plpgsql as $$
begin
  update themes set version = version + 1, updated_at = now() where id = coalesce(new.theme_id, old.theme_id);
  return null;
end $$;
create trigger theme_files_bump after insert or update or delete on theme_files for each row execute function bump_theme_version();

-- ---------------------------------------------------------------- konten (Fase 0: halaman & menu)
create table pages (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  handle text not null check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  body text not null default '',
  template_suffix text check (template_suffix ~ '^[a-z0-9_-]+$'),
  seo jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, handle)
);

-- items: [{ "title", "url", "items": [...] }] maks. 3 level.
create table menus (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  handle text not null check (handle ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  items jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  unique (site_id, handle)
);

create table audit_logs (
  id bigint generated always as identity primary key,
  site_id uuid references sites (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on audit_logs (site_id, created_at desc);

-- ---------------------------------------------------------------- fungsi hak akses
create function is_platform_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_platform_admin from profiles where user_id = auth.uid()), false)
$$;

create function has_site_role(p_site uuid, p_roles text[] default '{owner,admin,editor}') returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from site_members where site_id = p_site and user_id = auth.uid() and role = any (p_roles))
$$;

create function log_audit(p_site uuid, p_action text, p_detail jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  insert into audit_logs (site_id, user_id, action, detail) values (p_site, auth.uid(), p_action, p_detail)
$$;

-- ---------------------------------------------------------------- RLS
alter table profiles enable row level security;
alter table plans enable row level security;
alter table sites enable row level security;
alter table site_members enable row level security;
alter table site_invites enable row level security;
alter table domains enable row level security;
alter table themes enable row level security;
alter table theme_files enable row level security;
alter table pages enable row level security;
alter table menus enable row level security;
alter table audit_logs enable row level security;

-- Profil: diri sendiri + sesama anggota situs. Hanya kolom `name` yang boleh diubah user.
create policy profiles_read on profiles for select using (
  user_id = auth.uid() or is_platform_admin()
  or exists (select 1 from site_members a join site_members b using (site_id) where a.user_id = auth.uid() and b.user_id = profiles.user_id)
);
create policy profiles_update on profiles for update using (user_id = auth.uid());
revoke update on profiles from anon, authenticated;
grant update (name) on profiles to authenticated;

create policy plans_read on plans for select using (true);

-- Situs dibuat lewat RPC create_site. Owner/admin boleh mengubah; kolom milik platform dijaga trigger.
create policy sites_read on sites for select using (has_site_role(id) or is_platform_admin());
create policy sites_update on sites for update using (has_site_role(id, '{owner,admin}') or is_platform_admin());

create function sites_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if is_platform_admin() or auth.uid() is null then return new; end if;   -- service role / platform admin
  if new.show_badge is distinct from old.show_badge or new.plan_id is distinct from old.plan_id
     or new.suspended_reason is distinct from old.suspended_reason then
    raise exception 'Hanya platform admin yang boleh mengubah badge, plan, atau suspend.';
  end if;
  if (old.status = 'suspended' or new.status = 'suspended') and new.status is distinct from old.status then
    raise exception 'Situs ini disuspend platform admin.';
  end if;
  if new.deleted_at is distinct from old.deleted_at and not has_site_role(old.id, '{owner}') then
    raise exception 'Hanya owner yang boleh menghapus situs.';
  end if;
  return new;
end $$;
create trigger sites_guard before update on sites for each row execute function sites_guard();

-- Anggota: semua anggota melihat daftar; owner/admin mengubah/menghapus anggota non-owner; siapa pun (kecuali owner) boleh keluar.
create policy members_read on site_members for select using (has_site_role(site_id) or is_platform_admin());
create policy members_update on site_members for update
  using (role <> 'owner' and has_site_role(site_id, '{owner,admin}')) with check (role <> 'owner');
create policy members_delete on site_members for delete
  using (role <> 'owner' and (user_id = auth.uid() or has_site_role(site_id, '{owner,admin}')));

create policy invites_all on site_invites for all
  using (has_site_role(site_id, '{owner,admin}')) with check (has_site_role(site_id, '{owner,admin}'));

create policy domains_read on domains for select using (has_site_role(site_id) or is_platform_admin());
create policy domains_write on domains for all
  using (has_site_role(site_id, '{owner,admin}')) with check (has_site_role(site_id, '{owner,admin}'));

-- Theme bawaan bisa dibaca semua user login (galeri theme); theme situs hanya anggotanya.
create policy themes_read on themes for select using (
  (site_id is null and auth.uid() is not null) or has_site_role(site_id) or is_platform_admin());
create policy themes_write on themes for all
  using (site_id is not null and has_site_role(site_id, '{owner,admin}'))
  with check (site_id is not null and has_site_role(site_id, '{owner,admin}'));

create policy theme_files_read on theme_files for select using (
  exists (select 1 from themes t where t.id = theme_id and ((t.site_id is null and auth.uid() is not null) or has_site_role(t.site_id) or is_platform_admin())));
-- Editor menulis template JSON lewat RPC editor (Fase 2); di sini hanya owner/admin.
create policy theme_files_write on theme_files for all
  using (exists (select 1 from themes t where t.id = theme_id and t.site_id is not null and has_site_role(t.site_id, '{owner,admin}')))
  with check (exists (select 1 from themes t where t.id = theme_id and t.site_id is not null and has_site_role(t.site_id, '{owner,admin}')));

create policy pages_all on pages for all using (has_site_role(site_id)) with check (has_site_role(site_id));
create policy menus_all on menus for all using (has_site_role(site_id)) with check (has_site_role(site_id));

create policy audit_read on audit_logs for select using (has_site_role(site_id, '{owner,admin}') or is_platform_admin());

-- ---------------------------------------------------------------- RPC
-- Slug yang tidak boleh dipakai situs (subdomain platform).
create function is_reserved_slug(p_slug text) returns boolean language sql immutable as $$
  select p_slug = any ('{app,www,docs,api,admin,platform,mail,email,smtp,ftp,cdn,static,assets,status,blog,help,support,dashboard,login,auth,billing,dev,staging,test,fauqa,oneclick}'::text[])
$$;

-- Buat situs baru: situs + owner + salinan theme bawaan + halaman & menu awal. Mengembalikan id situs.
create function create_site(p_name text, p_slug text, p_industry text default 'umum', p_locale text default 'id', p_theme text default 'lumen')
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
  insert into menus (site_id, handle, title, items) values
    (v_site, 'main-menu', 'Menu utama', '[{"title":"Beranda","url":"/"},{"title":"Tentang Kami","url":"/pages/tentang-kami"},{"title":"Kontak","url":"/pages/kontak"}]'),
    (v_site, 'footer', 'Footer', '[{"title":"Tentang Kami","url":"/pages/tentang-kami"},{"title":"Kontak","url":"/pages/kontak"}]');

  perform log_audit(v_site, 'site.create', jsonb_build_object('slug', v_slug, 'theme', p_theme));
  return v_site;
end $$;

-- Terima undangan: email akun harus sama dengan email undangan.
create function accept_invite(p_token text) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_inv site_invites;
  v_email text;
begin
  select lower(email) into v_email from auth.users where id = auth.uid();
  select * into v_inv from site_invites where token = p_token and accepted_at is null and expires_at > now();
  if not found then raise exception 'Undangan tidak ditemukan atau sudah kedaluwarsa.'; end if;
  if v_inv.email <> v_email then raise exception 'Undangan ini untuk %. Masuk dengan email tersebut.', v_inv.email; end if;

  insert into site_members (site_id, user_id, role) values (v_inv.site_id, auth.uid(), v_inv.role)
  on conflict (site_id, user_id) do nothing;
  update site_invites set accepted_at = now() where id = v_inv.id;
  perform log_audit(v_inv.site_id, 'member.join', jsonb_build_object('email', v_email, 'role', v_inv.role));
  return v_inv.site_id;
end $$;

revoke execute on function create_site, accept_invite from anon;
