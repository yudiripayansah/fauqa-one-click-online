-- Fase 3 — Edit kode & paket theme (PRD §4.4, §6.7).

-- Riwayat versi file theme: isi lama disimpan setiap kali berubah, 20 terakhir per file (PRD §4.4).
create table theme_file_versions (
  id bigint generated always as identity primary key,
  theme_file_id uuid not null references theme_files (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);
create index on theme_file_versions (theme_file_id, id desc);

create function theme_files_version() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.content is not null and new.content is distinct from old.content then
    insert into theme_file_versions (theme_file_id, content, created_at, created_by) values (old.id, old.content, old.updated_at, old.updated_by);
    delete from theme_file_versions where theme_file_id = old.id
      and id not in (select id from theme_file_versions where theme_file_id = old.id order by id desc limit 20);
  end if;
  return new;
end $$;
create trigger theme_files_version after update of content on theme_files for each row execute function theme_files_version();
revoke execute on function theme_files_version() from public, anon, authenticated;

alter table theme_file_versions enable row level security;
create policy theme_file_versions_read on theme_file_versions for select using (
  exists (select 1 from theme_files f join themes t on t.id = f.theme_id
          where f.id = theme_file_id and t.site_id is not null and has_site_role(t.site_id, '{owner,admin}')));

-- Aset biner theme (gambar, font) di bucket publik theme-assets/<theme_id>/<key>.
-- Duplikat theme memakai objek yang sama; objek dihapus hanya bila tidak dirujuk theme lain.
insert into storage.buckets (id, name, public) values ('theme-assets', 'theme-assets', true) on conflict (id) do nothing;

create function can_edit_theme(p_theme uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from themes where id = p_theme and site_id is not null and has_site_role(site_id, '{owner,admin}'))
$$;
create policy theme_assets_read on storage.objects for select to authenticated
  using (bucket_id = 'theme-assets' and can_edit_theme(((storage.foldername(name))[1])::uuid));
create policy theme_assets_write on storage.objects for insert to authenticated
  with check (bucket_id = 'theme-assets' and can_edit_theme(((storage.foldername(name))[1])::uuid));
create policy theme_assets_delete on storage.objects for delete to authenticated
  using (bucket_id = 'theme-assets' and can_edit_theme(((storage.foldername(name))[1])::uuid));
