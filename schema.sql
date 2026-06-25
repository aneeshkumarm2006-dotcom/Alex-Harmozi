-- Chat with Alex Hormozi -- Supabase schema
-- Run this once in the Supabase SQL editor (Dashboard -> SQL -> New query).
-- Dimension 1024 matches Voyage voyage-3 / voyage-3-large. If you change
-- VOYAGE_MODEL / EMBED_DIM in config.py, change vector(1024) here to match.

create extension if not exists vector;

create table if not exists chunks (
  id            text primary key,
  video_id      text not null,
  title         text,
  url           text,
  published_at  timestamptz,
  start_seconds double precision,
  end_seconds   double precision,
  ts            text,
  deep_link     text,
  content       text not null,
  token_count   int,
  embedding     vector(1024),
  -- generated full-text column so we can add hybrid (vector + keyword) search later
  fts tsvector generated always as (to_tsvector('english', content)) stored
);

-- Approximate-nearest-neighbour index for cosine distance.
create index if not exists chunks_embedding_hnsw
  on chunks using hnsw (embedding vector_cosine_ops);

-- Keyword index (for future hybrid search).
create index if not exists chunks_fts_gin
  on chunks using gin (fts);

create index if not exists chunks_video_id_idx on chunks (video_id);

-- The backend connects as service_role; make sure it can read/write the table.
grant all privileges on table chunks to service_role;

-- Vector similarity search RPC used by api.py.
-- Returns cosine similarity in [ -1, 1 ] (1 = identical direction).
create or replace function match_chunks (
  query_embedding vector(1024),
  match_count int default 8
)
returns table (
  id text,
  video_id text,
  title text,
  url text,
  deep_link text,
  ts text,
  start_seconds double precision,
  content text,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.video_id,
    c.title,
    c.url,
    c.deep_link,
    c.ts,
    c.start_seconds,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  where c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
