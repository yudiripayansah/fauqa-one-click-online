-- Fase 5: analytics bawaan tanpa cookie (PRD §4.9). Event mentah 90 hari (partisi per bulan), ringkasan harian selamanya.
-- Pengunjung = hash(salt harian + situs + IP + user agent), jadi satu kunjungan = satu pengunjung per hari.
-- ponytail: sesi = pengunjung per hari (bukan jeda 30 menit); bounce & durasi dihitung per hari.

create table analytics_events (
  site_id uuid not null,
  ts timestamptz not null default now(),
  type text not null check (type in ('pageview', 'event')),
  name text not null check (length(name) <= 60),
  path text not null check (length(path) <= 500),
  locale text,
  referrer_host text,
  utm jsonb not null default '{}',
  country text,
  city text,
  device text,
  browser text,
  os text,
  visitor_hash text not null,
  props jsonb not null default '{}'
) partition by range (ts);
create index on analytics_events (site_id, ts);
create table analytics_events_default partition of analytics_events default;
alter table analytics_events enable row level security; -- tanpa policy: hanya service role & fungsi di bawah

-- Partisi bulan ini + bulan depan (dipanggil migrasi & cron harian).
create function ensure_analytics_partitions() returns void language plpgsql security definer set search_path = public as $$
declare m date;
begin
  for i in 0..1 loop
    m := (date_trunc('month', now()) + make_interval(months => i))::date;
    execute format('create table if not exists %I partition of analytics_events for values from (%L) to (%L)',
      'analytics_events_' || to_char(m, 'YYYY_MM'), m, (m + interval '1 month')::date);
  end loop;
end $$;
select ensure_analytics_partitions();

create table analytics_daily (
  site_id uuid not null references sites (id) on delete cascade,
  date date not null,
  dimension text not null,   -- total | page | source | campaign | country | city | device | browser | os | product | event | conversion
  value text not null default '',
  visitors int not null default 0,
  pageviews int not null default 0,
  events int not null default 0,
  sessions int not null default 0,
  bounces int not null default 0,
  duration_s bigint not null default 0,
  primary key (site_id, date, dimension, value)
);
alter table analytics_daily enable row level security;
create policy analytics_daily_read on analytics_daily for select using (has_site_role(site_id) or is_platform_admin());

-- Agregasi event mentah → baris berbentuk analytics_daily, per tanggal zona waktu situs.
create function analytics_rows(p_site uuid, p_from date, p_to date) returns setof analytics_daily
language sql stable security definer set search_path = public as $$
  with tz as (select coalesce(settings->>'timezone', 'Asia/Jakarta') z from sites where id = p_site),
  e as (
    select ev.*, (ev.ts at time zone tz.z)::date d,
      -- sumber kunjungan = sumber event pertama pengunjung hari itu
      first_value(coalesce(nullif(ev.utm->>'source', ''), ev.referrer_host, '(langsung)'))
        over (partition by ev.visitor_hash, (ev.ts at time zone tz.z)::date order by ev.ts) src
    from analytics_events ev, tz
    where ev.site_id = p_site and ev.ts >= (p_from::timestamp at time zone tz.z) and ev.ts < ((p_to + 1)::timestamp at time zone tz.z)
  ),
  sess as (
    select d, visitor_hash, count(*) filter (where type = 'pageview') pv, extract(epoch from max(ts) - min(ts)) dur from e group by d, visitor_hash
  ),
  totals as (
    select e.d, count(distinct e.visitor_hash)::int v, count(*) filter (where e.type = 'pageview')::int pv, count(*) filter (where e.type = 'event')::int ev
    from e group by e.d
  ),
  dims as (
    select d, visitor_hash, type, 'page' dim, path val from e where type = 'pageview'
    union all select d, visitor_hash, type, 'source', src from e
    union all select d, visitor_hash, type, 'campaign', utm->>'campaign' from e where coalesce(utm->>'campaign', '') <> ''
    union all select d, visitor_hash, type, 'country', coalesce(country, '?') from e
    union all select d, visitor_hash, type, 'city', coalesce(city, '?') from e
    union all select d, visitor_hash, type, 'device', coalesce(device, '?') from e
    union all select d, visitor_hash, type, 'browser', coalesce(browser, '?') from e
    union all select d, visitor_hash, type, 'os', coalesce(os, '?') from e
    union all select d, visitor_hash, type, 'product', props->>'product' from e where type = 'pageview' and props ? 'product'
    union all select d, visitor_hash, type, 'event', name from e where type = 'event'
    union all select d, visitor_hash, type, 'conversion', src from e where name in ('form_submit', 'whatsapp')
  )
  select p_site, t.d, 'total', '', t.v, t.pv, t.ev, t.v,
    (select count(*)::int from sess where sess.d = t.d and sess.pv <= 1),
    (select coalesce(sum(dur), 0)::bigint from sess where sess.d = t.d)
  from totals t
  union all
  select p_site, d, dim, left(coalesce(val, ''), 300), count(distinct visitor_hash)::int,
    count(*) filter (where type = 'pageview')::int, count(*) filter (where type = 'event')::int, 0, 0, 0::bigint
  from dims group by d, dim, val
$$;

-- Laporan dashboard: ringkasan harian yang sudah di-rollup + agregasi langsung untuk hari setelahnya (mis. hari ini).
create function analytics_report(p_site uuid, p_from date, p_to date) returns setof analytics_daily
language plpgsql stable security definer set search_path = public as $$
declare v_rolled date;
begin
  if not (has_site_role(p_site) or is_platform_admin()) then raise exception 'Tidak berhak.'; end if;
  select max(date) into v_rolled from analytics_daily where site_id = p_site and dimension = 'total';
  return query select * from analytics_daily where site_id = p_site and date between p_from and least(p_to, coalesce(v_rolled, p_from - 1));
  return query select * from analytics_rows(p_site, greatest(p_from, coalesce(v_rolled + 1, p_from)), p_to);
end $$;

-- Pengunjung 5 menit terakhir.
create function analytics_realtime(p_site uuid) returns int language sql stable security definer set search_path = public as $$
  select case when has_site_role(p_site) or is_platform_admin()
    then (select count(distinct visitor_hash)::int from analytics_events where site_id = p_site and ts > now() - interval '5 minutes') end
$$;

-- Cron harian: rollup tanggal tertentu untuk semua situs yang punya event, lalu hapus event mentah > 90 hari.
create function analytics_rollup(p_date date) returns int language plpgsql security definer set search_path = public as $$
declare s uuid; n int := 0;
begin
  for s in select distinct site_id from analytics_events where ts >= p_date - 1 and ts < p_date + 2 loop
    delete from analytics_daily where site_id = s and date = p_date;
    insert into analytics_daily select * from analytics_rows(s, p_date, p_date) where date = p_date;
    n := n + 1;
  end loop;
  delete from analytics_events where ts < now() - interval '90 days';
  return n;
end $$;

revoke execute on function ensure_analytics_partitions(), analytics_rows(uuid, date, date), analytics_rollup(date) from public, anon, authenticated;
revoke execute on function analytics_report(uuid, date, date), analytics_realtime(uuid) from public, anon;
grant execute on function analytics_report(uuid, date, date), analytics_realtime(uuid) to authenticated;

-- Laporan penyalahgunaan dari tombol "Laporkan situs" (PRD §8.2). Ditulis server; dibaca & ditangani platform admin.
create table abuse_reports (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites (id) on delete cascade,
  reason text not null check (reason in ('phishing', 'scam', 'spam', 'lainnya')),
  detail text not null default '' check (length(detail) <= 2000),
  reporter_email text check (length(reporter_email) <= 200),
  status text not null default 'new' check (status in ('new', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index on abuse_reports (status, created_at desc);
alter table abuse_reports enable row level security;
create policy abuse_admin on abuse_reports for all using (is_platform_admin()) with check (is_platform_admin());
