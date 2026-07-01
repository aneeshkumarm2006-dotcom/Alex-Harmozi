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

-- Embeddings so the normal chat can retrieve relevant cases alongside transcripts.
alter table business_cases add column if not exists embedding vector(1024);
create index if not exists business_cases_embedding_hnsw
  on business_cases using hnsw (embedding vector_cosine_ops);

create or replace function match_business_cases (
  query_embedding vector(1024),
  match_count int default 12
)
returns table (
  id bigint, video_id text, title text, deep_link text, "timestamp" text,
  business text, niche text, situation text, advice text, similarity float
)
language sql stable as $$
  select c.id, c.video_id, c.title, c.deep_link, c."timestamp",
         c.business, c.niche, c.situation, c.advice,
         1 - (c.embedding <=> query_embedding) as similarity
  from business_cases c
  where c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
grant execute on function match_business_cases(vector, int) to service_role;

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
