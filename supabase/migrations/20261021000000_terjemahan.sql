-- Fase 4: multi-bahasa (PRD §4.10, §8.1). Teks bahasa kedua per field; yang kosong memakai bahasa utama.
-- resource_key: id baris (page/product/collection/blog/article), handle menu, id theme, atau 'site'.
-- field theme: '<id section render>.<setting>' atau '<id section render>.<id block>.<setting>'.
create table translations (
  id bigint generated always as identity primary key,
  site_id uuid not null references sites (id) on delete cascade,
  locale text not null check (locale in ('id', 'en')),
  resource_type text not null check (resource_type in ('site', 'page', 'product', 'collection', 'blog', 'article', 'menu', 'theme')),
  resource_key text not null,
  field text not null check (length(field) <= 300),
  value text not null check (length(value) <= 100000),
  updated_at timestamptz not null default now(),
  unique (site_id, locale, resource_type, resource_key, field)
);
alter table translations enable row level security;
create policy translations_all on translations for all using (has_site_role(site_id)) with check (has_site_role(site_id));
