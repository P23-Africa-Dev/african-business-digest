-- Provenance for discussions (X, Reddit, web search, etc.)
alter table discussions
  add column if not exists source_type source_type_enum;

create index if not exists idx_discussions_source_type on discussions (source_type);

-- Backfill X discussions from URL pattern
update discussions
set source_type = 'twitter'
where source_type is null
  and (url ilike '%x.com%' or url ilike '%twitter.com%');
