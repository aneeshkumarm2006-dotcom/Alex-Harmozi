-- Business cases (extracted by extract_businesses.py) -- run once in Supabase SQL editor.
-- Owner-only data: RLS on with no policy => only the backend (service_role) can read it,
-- and the /business-cases endpoint additionally gates by OWNER_EMAIL.

create table if not exists business_cases (
  id          bigint generated always as identity primary key,
  video_id    text,
  title       text,
  url         text,
  deep_link   text,
  timestamp   text,
  business    text,
  niche       text,
  situation   text,
  advice      text,
  created_at  timestamptz not null default now()
);

create index if not exists business_cases_niche_idx on business_cases (lower(niche));
create index if not exists business_cases_fts on business_cases using gin (
  to_tsvector('english',
    coalesce(business,'') || ' ' || coalesce(niche,'') || ' ' ||
    coalesce(situation,'') || ' ' || coalesce(advice,''))
);

alter table business_cases enable row level security;   -- no policy => backend-only
grant all on table business_cases to service_role;

-- Niche facet counts for the filter chips.
create or replace function business_niche_counts()
returns table (niche text, n bigint)
language sql stable as $$
  select coalesce(nullif(trim(niche), ''), 'other') as niche, count(*)::bigint
  from business_cases
  group by 1
  order by 2 desc;
$$;
grant execute on function business_niche_counts() to service_role;
