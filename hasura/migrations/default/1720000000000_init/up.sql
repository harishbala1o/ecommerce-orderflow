create extension if not exists pgcrypto;

create type order_status as enum
  ('PENDING','CONFIRMED','PACKED','SHIPPED','DELIVERED','CANCELLED','RETURNED');

create table users (
  id            uuid primary key default gen_random_uuid(),
  keycloak_id   text unique,
  email         text not null unique,
  display_name  text not null,
  role          text not null default 'customer'
                  check (role in ('customer','ops','admin')),
  created_at    timestamptz not null default now()
);

create table products (
  id               uuid primary key default gen_random_uuid(),
  sku              text not null unique,
  name             text not null,
  description      text,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  stock_qty        integer not null default 0 check (stock_qty >= 0),
  created_at       timestamptz not null default now()
);

create table orders (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references users(id),
  status       order_status not null default 'PENDING',
  total_cents  integer not null default 0 check (total_cents >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index orders_customer_id_idx on orders (customer_id);
create index orders_status_idx on orders (status);

create table order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders(id) on delete cascade,
  product_id       uuid not null references products(id),
  quantity         integer not null check (quantity > 0),
  unit_price_cents integer not null check (unit_price_cents >= 0)
);
create index order_items_order_id_idx on order_items (order_id);

create table order_events (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  from_status    order_status,
  to_status      order_status not null,
  action         text not null,
  actor_id       uuid references users(id),
  actor_role     text,
  reason         text,
  correlation_id text,
  created_at     timestamptz not null default now()
);
create index order_events_order_id_created_at_idx on order_events (order_id, created_at);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger orders_set_updated_at
  before update on orders
  for each row execute function set_updated_at();
