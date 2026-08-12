-- Inventory bounded context. This lives in its own database: PostgreSQL cannot
-- join or transact across databases, so the boundary is enforced by the engine
-- rather than by convention.

create extension if not exists pgcrypto;

create table stock_items (
  product_id     uuid primary key,          -- mirrors the catalog id; no FK, different DB
  sku            text not null unique,
  on_hand        integer not null default 0 check (on_hand >= 0),
  reserved       integer not null default 0 check (reserved >= 0),
  reorder_level  integer not null default 0 check (reorder_level >= 0),
  reorder_qty    integer not null default 0 check (reorder_qty >= 0),
  updated_at     timestamptz not null default now(),
  -- available is always derived as on_hand - reserved and is never stored.
  constraint reserved_within_on_hand check (reserved <= on_hand)
);

create type reservation_status as enum ('HELD', 'RELEASED', 'COMMITTED');

create table reservations (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null,
  product_id  uuid not null references stock_items(product_id),
  quantity    integer not null check (quantity > 0),
  status      reservation_status not null default 'HELD',
  -- null once the order service confirms the order was created. The sweeper only
  -- reclaims holds that still carry an expiry.
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (order_id, product_id)             -- gives reserve idempotency for free
);
create index reservations_order_id_idx on reservations (order_id);
create index reservations_sweep_idx on reservations (expires_at) where status = 'HELD';

create type movement_kind as enum ('RESERVE', 'RELEASE', 'COMMIT', 'RECEIVE', 'ADJUST');

-- Append-only audit of every stock change, mirroring order_events in the order DB.
create table stock_movements (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references stock_items(product_id),
  order_id       uuid,
  kind           movement_kind not null,
  quantity       integer not null,
  on_hand_after  integer not null,
  reserved_after integer not null,
  reason         text,
  created_at     timestamptz not null default now()
);
create index stock_movements_product_created_idx on stock_movements (product_id, created_at desc);

create type alert_level as enum ('LOW', 'OUT_OF_STOCK');
create type alert_status as enum ('OPEN', 'RESOLVED');

create table stock_alerts (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references stock_items(product_id),
  sku           text not null,
  level         alert_level not null,
  status        alert_status not null default 'OPEN',
  available     integer not null,
  reorder_level integer not null,
  suggested_qty integer not null,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
-- At most one open alert per product, enforced by the database rather than by
-- application logic that a concurrent call could race past.
create unique index stock_alerts_one_open_per_product
  on stock_alerts (product_id) where status = 'OPEN';

-- Inbound Hasura event deliveries are at-least-once; this makes handling idempotent.
create table processed_events (
  event_id     text primary key,
  processed_at timestamptz not null default now()
);

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger stock_items_touch before update on stock_items
  for each row execute function touch_updated_at();
create trigger reservations_touch before update on reservations
  for each row execute function touch_updated_at();
