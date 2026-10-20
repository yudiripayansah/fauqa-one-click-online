-- Fase 4: custom domain (PRD §4.10). Owner/admin hanya boleh menambah & menghapus domain; status, verifikasi,
-- dan alias subdomain lama (type 'platform') ditulis server (service role) setelah cek ke Vercel.
drop policy domains_write on domains;
create policy domains_insert on domains for insert
  with check (has_site_role(site_id, '{owner,admin}') and type = 'custom' and status = 'pending_dns' and verification = '{}');
create policy domains_delete on domains for delete using (type = 'custom' and has_site_role(site_id, '{owner,admin}'));

-- Kuota custom domain per plan.
create function domains_quota() returns trigger language plpgsql security definer set search_path = public as $$
declare v_limit bigint := plan_limit(new.site_id, 'custom_domains');
begin
  if new.type = 'custom' and v_limit is not null
     and (select count(*) from domains where site_id = new.site_id and type = 'custom') >= v_limit then
    raise exception 'Batas % custom domain tercapai.', v_limit;
  end if;
  return new;
end $$;
revoke execute on function domains_quota() from public, anon, authenticated;
create trigger domains_quota before insert on domains for each row execute function domains_quota();

-- Domain utama harus custom domain aktif milik situs ini.
create function sites_primary_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.primary_domain_id is not null and new.primary_domain_id is distinct from old.primary_domain_id
     and not exists (select 1 from domains where id = new.primary_domain_id and site_id = new.id and type = 'custom' and status = 'active') then
    raise exception 'Domain utama harus custom domain aktif milik situs ini.';
  end if;
  return new;
end $$;
revoke execute on function sites_primary_guard() from public, anon, authenticated;
create trigger sites_primary_guard before update on sites for each row execute function sites_primary_guard();
