-- Fase 2 — Theme editor & theme library (PRD §4.3, §4.4).

-- Simpan file JSON theme dari editor visual. Semua anggota (termasuk editor) boleh, tapi hanya
-- template JSON, section group, dan settings_data.json. Deteksi konflik: p_expected = updated_at saat file dibuka.
create function save_theme_json(p_theme uuid, p_key text, p_content text, p_expected timestamptz default null)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare
  v_site uuid;
  v_file theme_files;
  v_now timestamptz := now();
begin
  select site_id into v_site from themes where id = p_theme;
  if v_site is null or not has_site_role(v_site) then raise exception 'Tidak berhak.'; end if;
  if p_key !~ '^(templates/[a-z0-9_-]+(\.[a-z0-9_-]+)?\.json|sections/[a-z0-9_-]+\.json|config/settings_data\.json)$' then
    raise exception 'File % tidak bisa diubah dari editor visual.', p_key;
  end if;
  perform p_content::jsonb;                                   -- harus JSON valid
  if length(p_content) > 512 * 1024 then raise exception 'File terlalu besar.'; end if;

  select * into v_file from theme_files where theme_id = p_theme and key = p_key for update;
  if found then
    if p_expected is not null and v_file.updated_at > p_expected then
      raise exception 'KONFLIK: % sudah diubah orang lain sejak Anda membukanya.', p_key using errcode = 'P0409';
    end if;
    update theme_files set content = p_content, size = length(p_content), checksum = md5(p_content), updated_at = v_now, updated_by = auth.uid()
    where id = v_file.id;
  else
    -- File baru hanya template alternatif (Buat template).
    if p_key !~ '^templates/' then raise exception 'File % tidak ada.', p_key; end if;
    insert into theme_files (theme_id, key, content, size, checksum, updated_at, updated_by)
    values (p_theme, p_key, p_content, length(p_content), md5(p_content), v_now, auth.uid());
  end if;
  return v_now;
end $$;

-- Tambah theme ke situs: dari theme bawaan (p_source = theme bawaan) atau duplikat theme situs sendiri.
create function copy_theme(p_site uuid, p_source uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_src themes;
  v_new uuid;
begin
  if not has_site_role(p_site, '{owner,admin}') then raise exception 'Tidak berhak.'; end if;
  select * into v_src from themes where id = p_source and (site_id = p_site or site_id is null);
  if not found then raise exception 'Theme tidak ditemukan.'; end if;
  if (select count(*) from themes where site_id = p_site) >= coalesce(plan_limit(p_site, 'themes'), 10) then
    raise exception 'Batas % theme tersimpan tercapai. Hapus theme yang tidak dipakai.', plan_limit(p_site, 'themes');
  end if;
  insert into themes (site_id, name, source, builtin_key, based_on_id, builtin_version)
  values (p_site, left(coalesce(nullif(trim(p_name), ''), v_src.name), 80),
          case when v_src.site_id is null then 'builtin' else 'duplicate' end,
          v_src.builtin_key, v_src.id, v_src.builtin_version)
  returning id into v_new;
  insert into theme_files (theme_id, key, content, storage_path, checksum, size, updated_by)
  select v_new, key, content, storage_path, checksum, size, auth.uid() from theme_files where theme_id = p_source;
  perform log_audit(p_site, 'theme.add', jsonb_build_object('theme', v_new, 'from', p_source));
  return v_new;
end $$;

revoke execute on function save_theme_json(uuid, text, text, timestamptz), copy_theme(uuid, uuid, text) from public, anon;
grant execute on function save_theme_json(uuid, text, text, timestamptz), copy_theme(uuid, uuid, text) to authenticated;

-- Theme live harus milik situs itu sendiri (theme upload bersifat privat), dan tidak bisa dihapus.
create or replace function sites_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if new.live_theme_id is distinct from old.live_theme_id and new.live_theme_id is not null
     and not exists (select 1 from themes where id = new.live_theme_id and site_id = new.id) then
    raise exception 'Theme bukan milik situs ini.';
  end if;
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

create function themes_guard_delete() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from sites where live_theme_id = old.id and deleted_at is null) then
    raise exception 'Theme live tidak bisa dihapus. Publish theme lain dulu.';
  end if;
  return old;
end $$;
create trigger themes_guard_delete before delete on themes for each row execute function themes_guard_delete();
revoke execute on function themes_guard_delete() from public, anon, authenticated;
