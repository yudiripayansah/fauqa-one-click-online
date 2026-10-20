-- Fase 4: wizard buat situs, preset industri, AI generator (PRD §4.2, §4.2.1, §7).

-- Preset industri: dikelola platform admin, dibaca wizard (semua user login).
create table industry_presets (
  key text primary key check (key ~ '^[a-z0-9_-]+$'),
  name text not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table industry_presets enable row level security;
create policy presets_read on industry_presets for select using (auth.uid() is not null);
create policy presets_write on industry_presets for all using (is_platform_admin()) with check (is_platform_admin());

-- Log pemakaian AI (biaya & batas harian).
create table ai_generations (
  id bigint generated always as identity primary key,
  site_id uuid references sites (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('site', 'text')),
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  duration_ms int not null default 0,
  status text not null check (status in ('ok', 'fallback', 'error')),
  created_at timestamptz not null default now()
);
create index on ai_generations (site_id, kind, created_at desc);
alter table ai_generations enable row level security;
create policy ai_read on ai_generations for select using (has_site_role(site_id, '{owner,admin}') or is_platform_admin());
-- Ditulis server (service role) saja.

-- Konten contoh dari preset/AI ditandai sampai diedit manusia (checklist "Siap publish").
alter table pages add column sample text check (sample in ('preset', 'ai'));
alter table products add column sample text check (sample in ('preset', 'ai'));
alter table articles add column sample text check (sample in ('preset', 'ai'));

create function clear_sample() returns trigger language plpgsql set search_path = public as $$
begin
  -- Edit oleh user (bukan perubahan kolom sample itu sendiri) = konten sudah disentuh manusia.
  if auth.uid() is not null and new.sample is not distinct from old.sample then new.sample := null; end if;
  return new;
end $$;
revoke execute on function clear_sample() from public, anon, authenticated;
create trigger pages_sample before update on pages for each row when (old.sample is not null) execute function clear_sample();
create trigger products_sample before update on products for each row when (old.sample is not null) execute function clear_sample();
create trigger articles_sample before update on articles for each row when (old.sample is not null) execute function clear_sample();
