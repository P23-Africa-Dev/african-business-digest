-- Run this in Supabase → SQL Editor if ingest/cluster/discussions fail on enum or columns.
-- Safe to re-run (uses IF NOT EXISTS / duplicate guards).

-- 004: twitter + youtube source types
do $$ begin
  alter type source_type_enum add value 'twitter';
exception when duplicate_object then null;
end $$;
do $$ begin
  alter type source_type_enum add value 'youtube';
exception when duplicate_object then null;
end $$;

-- 006: ingest_lane on raw_items + stories
alter table raw_items add column if not exists ingest_lane text not null default 'business_core';
alter table stories add column if not exists ingest_lane text not null default 'business_core';

-- 007: society + trending categories
alter type category_enum add value if not exists 'society';
alter type category_enum add value if not exists 'trending';

-- 008: discussions.source_type
alter table discussions add column if not exists source_type source_type_enum;
create index if not exists idx_discussions_source_type on discussions (source_type);
update discussions
set source_type = 'twitter'
where source_type is null
  and (url ilike '%x.com%' or url ilike '%twitter.com%');
