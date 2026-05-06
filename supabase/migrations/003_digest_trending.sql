alter table raw_items add column if not exists engagement_score integer not null default 0;

do $$ begin
  alter type category_enum add value 'agriculture';
exception when duplicate_object then null;
end $$;
do $$ begin
  alter type category_enum add value 'infrastructure';
exception when duplicate_object then null;
end $$;
do $$ begin
  alter type category_enum add value 'consumer_markets';
exception when duplicate_object then null;
end $$;

create table if not exists brave_api_calls (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  query      text not null,
  ok         boolean not null default true
);

create index if not exists idx_brave_api_calls_created_at on brave_api_calls (created_at desc);
-- Raw item engagement (e.g. Reddit) for discussion ranking and ingest upserts
alter table raw_items add column if not exists engagement_score integer not null default 0;

-- Extra story categories (run once per database; re-apply may error if values exist)
alter type category_enum add value 'agriculture';
alter type category_enum add value 'infrastructure';
alter type category_enum add value 'consumer_markets';

-- Brave API usage for monthly caps (950 default buffer under 1000)
create table if not exists brave_api_calls (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  query      text not null,
  ok         boolean not null default true
);

create index if not exists idx_brave_api_calls_created_at on brave_api_calls (created_at desc);
