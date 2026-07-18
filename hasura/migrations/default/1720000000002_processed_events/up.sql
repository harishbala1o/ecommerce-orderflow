create table processed_events (
  event_id   text primary key,
  created_at timestamptz not null default now()
);
