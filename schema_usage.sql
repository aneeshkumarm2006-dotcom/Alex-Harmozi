-- Usage tracking -- run once in the Supabase SQL editor.
-- We log every Voyage embed + Claude generation here so the dashboard can show
-- tokens used / remaining / estimated cost. RLS on with no policy = only the
-- backend (service_role) can touch it; never exposed to the browser directly.

create table if not exists usage_log (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  provider      text not null,          -- 'voyage' | 'anthropic'
  model         text,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  total_tokens  bigint not null default 0,
  note          text
);
create index if not exists usage_log_provider_idx on usage_log (provider, created_at);

alter table usage_log enable row level security;  -- no policy => backend-only

-- Aggregated totals per provider (used by the /usage endpoint).
create or replace function usage_totals()
returns table (
  provider text,
  calls bigint,
  input_tokens bigint,
  output_tokens bigint,
  total_tokens bigint
)
language sql stable
as $$
  select
    provider,
    count(*)::bigint,
    coalesce(sum(input_tokens), 0)::bigint,
    coalesce(sum(output_tokens), 0)::bigint,
    coalesce(sum(total_tokens), 0)::bigint
  from usage_log
  group by provider;
$$;

-- Seed the one-time corpus ingest (~5.22M Voyage tokens) so the dashboard
-- reflects it. Idempotent: only inserts if not already present.
insert into usage_log (provider, model, total_tokens, note)
select 'voyage', 'voyage-3', 5217006, 'corpus ingest (one-time)'
where not exists (
  select 1 from usage_log where note = 'corpus ingest (one-time)'
);
