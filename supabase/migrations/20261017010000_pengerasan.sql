-- Pengerasan dari Supabase Security Advisor. Fungsi Postgres default bisa dieksekusi PUBLIC,
-- jadi `revoke ... from anon` saja tidak cukup: cabut dari PUBLIC lalu beri ke peran yang perlu.

-- Audit hanya untuk situs yang user ikuti (service role / proses sistem: auth.uid() null).
create or replace function log_audit(p_site uuid, p_action text, p_detail jsonb default '{}') returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not (has_site_role(p_site) or is_platform_admin()) then
    raise exception 'Tidak berhak.';
  end if;
  insert into audit_logs (site_id, user_id, action, detail) values (p_site, auth.uid(), p_action, p_detail);
end $$;

revoke execute on function log_audit(uuid, text, jsonb), create_site(text, text, text, text, text), accept_invite(text), plan_limit(uuid, text) from public, anon;
grant execute on function log_audit(uuid, text, jsonb), create_site(text, text, text, text, text), accept_invite(text) to authenticated;
-- Hanya service role (render situs).
revoke execute on function hit_redirect(uuid) from public, anon, authenticated;
-- Fungsi trigger tidak untuk dipanggil lewat RPC.
revoke execute on function handle_new_user(), sites_guard(), enforce_quota(), bump_theme_version(), articles_site() from public, anon, authenticated;

alter function is_reserved_slug(text) set search_path = public;
alter function bump_theme_version() set search_path = public;
alter function tags_text(text[]) set search_path = public;
alter function articles_site() set search_path = public;

-- Storage remove() membaca objek dulu: anggota perlu SELECT pada folder situsnya (bucket tetap publik untuk pengunjung).
create policy site_files_read on storage.objects for select to authenticated
  using (bucket_id = 'site-files' and has_site_role(((storage.foldername(name))[1])::uuid));
