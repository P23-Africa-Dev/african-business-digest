-- Dual editorial lane: business_core vs trending_broad (African trending beyond strict business)

alter table raw_items
  add column if not exists ingest_lane text not null default 'business_core';

alter table raw_items
  drop constraint if exists raw_items_ingest_lane_check;

alter table raw_items
  add constraint raw_items_ingest_lane_check
  check (ingest_lane in ('business_core', 'trending_broad'));

create index if not exists idx_raw_items_ingest_lane on raw_items (ingest_lane);

alter table stories
  add column if not exists ingest_lane text not null default 'business_core';

alter table stories
  drop constraint if exists stories_ingest_lane_check;

alter table stories
  add constraint stories_ingest_lane_check
  check (ingest_lane in ('business_core', 'trending_broad'));

create index if not exists idx_stories_ingest_lane on stories (ingest_lane);
