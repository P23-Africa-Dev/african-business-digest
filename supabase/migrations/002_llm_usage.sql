-- Track LLM token usage for daily budget enforcement
create table llm_usage (
  id         uuid primary key default gen_random_uuid(),
  model      text not null,
  tokens_in  integer not null default 0,
  tokens_out integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_llm_usage_created_at on llm_usage (created_at desc);
