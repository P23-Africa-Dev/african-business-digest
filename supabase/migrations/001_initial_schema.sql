-- African Business Digest: initial schema

create type source_type_enum as enum ('news', 'reddit', 'search');
create type story_status_enum as enum ('new', 'developing', 'fading');
create type category_enum as enum (
  'fintech',
  'logistics',
  'energy',
  'retail',
  'deals_funding',
  'policy',
  'business_failures'
);

-- Raw ingested content from all sources
create table raw_items (
  id            uuid primary key default gen_random_uuid(),
  source_type   source_type_enum not null,
  source_name   text not null,
  url           text not null unique,
  title         text not null,
  raw_content   text,
  published_at  timestamptz,
  ingested_at   timestamptz not null default now(),
  country_tags  text[] not null default '{}'
);

create index idx_raw_items_published_at  on raw_items (published_at desc);
create index idx_raw_items_ingested_at   on raw_items (ingested_at desc);
create index idx_raw_items_source_type   on raw_items (source_type);
create index idx_raw_items_country_tags  on raw_items using gin (country_tags);

-- LLM-clustered stories
create table stories (
  id              uuid primary key default gen_random_uuid(),
  headline        text not null,
  summary         text not null,
  category        category_enum not null,
  country_tags    text[] not null default '{}',
  relevance_score integer not null default 50 check (relevance_score between 0 and 100),
  status          story_status_enum not null default 'new',
  first_seen_at   timestamptz not null default now(),
  last_updated_at timestamptz not null default now()
);

create index idx_stories_category        on stories (category);
create index idx_stories_status          on stories (status);
create index idx_stories_first_seen_at   on stories (first_seen_at desc);
create index idx_stories_last_updated_at on stories (last_updated_at desc);
create index idx_stories_relevance       on stories (relevance_score desc);
create index idx_stories_country_tags    on stories using gin (country_tags);

-- Join: stories <-> raw_items
create table story_sources (
  id          uuid primary key default gen_random_uuid(),
  story_id    uuid not null references stories (id) on delete cascade,
  raw_item_id uuid not null references raw_items (id) on delete cascade,
  is_primary  boolean not null default false,
  unique (story_id, raw_item_id)
);

create index idx_story_sources_story_id    on story_sources (story_id);
create index idx_story_sources_raw_item_id on story_sources (raw_item_id);

-- Discussions (Reddit threads, social posts)
create table discussions (
  id               uuid primary key default gen_random_uuid(),
  platform         text not null,
  url              text not null unique,
  title            text not null,
  excerpt          text,
  engagement_score integer not null default 0,
  country_tags     text[] not null default '{}',
  category         category_enum,
  posted_at        timestamptz,
  ingested_at      timestamptz not null default now()
);

create index idx_discussions_platform       on discussions (platform);
create index idx_discussions_posted_at      on discussions (posted_at desc);
create index idx_discussions_engagement     on discussions (engagement_score desc);
create index idx_discussions_country_tags   on discussions using gin (country_tags);
