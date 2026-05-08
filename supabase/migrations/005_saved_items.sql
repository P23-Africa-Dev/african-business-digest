create table if not exists saved_items (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('story', 'discussion')),
  story_id uuid references stories(id) on delete cascade,
  discussion_id uuid references discussions(id) on delete cascade,
  title_snapshot text not null,
  url_snapshot text,
  category_snapshot text,
  country_tags_snapshot text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint saved_items_item_ref_xor check (
    (item_type = 'story' and story_id is not null and discussion_id is null)
    or
    (item_type = 'discussion' and discussion_id is not null and story_id is null)
  )
);

create unique index if not exists uniq_saved_items_story on saved_items(story_id) where story_id is not null;
create unique index if not exists uniq_saved_items_discussion on saved_items(discussion_id) where discussion_id is not null;
create index if not exists idx_saved_items_created_at on saved_items(created_at desc);
create index if not exists idx_saved_items_item_type on saved_items(item_type);
create index if not exists idx_saved_items_category_snapshot on saved_items(category_snapshot);
create index if not exists idx_saved_items_country_tags_snapshot on saved_items using gin (country_tags_snapshot);
