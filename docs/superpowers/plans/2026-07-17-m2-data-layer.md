# M2 — Data Layer (Postgres + Hasura + Docker Compose) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A one-command local data layer — `make up` brings up Postgres + Hasura, auto-applies versioned migrations and metadata, seeds sample data, and serves a working GraphQL API over the OrderFlow schema.

**Architecture:** Postgres 16 holds the schema. Hasura runs from the **`cli-migrations-v3`** image so migrations (`hasura/migrations`) and metadata (`hasura/metadata`) are applied automatically on boot — no hand-applying in a console, everything is versioned in git. Tables are tracked with FK-derived relationships. RBAC/permissions are deliberately deferred to M4 (they need Keycloak JWT claims); M2 runs with admin access only.

**Tech Stack:** Postgres 16, Hasura graphql-engine v2.42.0, Docker Compose, Make, bash + curl smoke test.

## Global Constraints

- TypeScript everywhere for app code (N/A this milestone — SQL/YAML/compose only).
- Commits authored as `Harish Balaji <36741511+harishbala1o@users.noreply.github.com>`. **No** `Co-Authored-By` / Claude mentions.
- Migrations are the **only** way schema changes happen — never `ALTER` via console.
- Money stored as integer **cents** (no floats). All ids `uuid` via `gen_random_uuid()`.
- Secrets only in `.env` (git-ignored); commit `.env.example` with safe placeholders.

---

### Task 1: Environment + Hasura project skeleton

**Files:**
- Create: `.env.example`
- Create: `hasura/config.yaml`
- Create: `hasura/metadata/version.yaml`
- Create: `hasura/metadata/databases/databases.yaml`
- Create: `hasura/metadata/actions.graphql` (empty placeholder for M3)
- Create: `hasura/metadata/actions.yaml` (empty)

- [ ] **Step 1: `.env.example`**

```dotenv
# Postgres
POSTGRES_USER=orderflow
POSTGRES_PASSWORD=orderflow_dev_pw
POSTGRES_DB=orderflow

# Hasura
HASURA_GRAPHQL_ADMIN_SECRET=orderflow_dev_admin_secret
HASURA_GRAPHQL_DATABASE_URL=postgres://orderflow:orderflow_dev_pw@postgres:5432/orderflow
PG_DATABASE_URL=postgres://orderflow:orderflow_dev_pw@postgres:5432/orderflow
```

- [ ] **Step 2: `hasura/config.yaml`**

```yaml
version: 3
endpoint: http://localhost:8080
metadata_directory: metadata
migrations_directory: migrations
actions:
  kind: synchronous
  handler_webhook_baseurl: http://localhost:3001
```

- [ ] **Step 3: `hasura/metadata/version.yaml`**

```yaml
version: 3
```

- [ ] **Step 4: `hasura/metadata/databases/databases.yaml`**

```yaml
- name: default
  kind: postgres
  configuration:
    connection_info:
      database_url:
        from_env: PG_DATABASE_URL
      isolation_level: read-committed
      pool_settings:
        idle_timeout: 180
        max_connections: 50
        retries: 1
  tables: "!include default/tables/tables.yaml"
```

- [ ] **Step 5: empty action files**

`hasura/metadata/actions.graphql` → empty file.
`hasura/metadata/actions.yaml`:

```yaml
actions: []
custom_types:
  enums: []
  input_objects: []
  objects: []
  scalars: []
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "chore(hasura): add project skeleton and env template"
```

---

### Task 2: Initial schema migration

**Files:**
- Create: `hasura/migrations/default/1720000000000_init/up.sql`
- Create: `hasura/migrations/default/1720000000000_init/down.sql`

**Interfaces:**
- Produces tables: `users`, `products`, `orders`, `order_items`, `order_events`; enum type `order_status`; `set_updated_at()` trigger on `orders`.

- [ ] **Step 1: `up.sql`**

```sql
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
```

- [ ] **Step 2: `down.sql`**

```sql
drop trigger if exists orders_set_updated_at on orders;
drop function if exists set_updated_at();
drop table if exists order_events;
drop table if exists order_items;
drop table if exists orders;
drop table if exists products;
drop table if exists users;
drop type if exists order_status;
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(db): add initial schema migration"
```

---

### Task 3: Seed data

**Files:**
- Create: `hasura/seeds/default/1720000000001_seed/up.sql`

- [ ] **Step 1: seed SQL (deterministic ids for repeatable smoke tests)**

```sql
insert into users (id, keycloak_id, email, display_name, role) values
  ('11111111-1111-1111-1111-111111111111', null, 'admin@orderflow.dev',    'Ada Admin',      'admin'),
  ('22222222-2222-2222-2222-222222222222', null, 'ops@orderflow.dev',      'Otto Ops',       'ops'),
  ('33333333-3333-3333-3333-333333333333', null, 'customer@orderflow.dev', 'Cara Customer',  'customer');

insert into products (id, sku, name, description, unit_price_cents, stock_qty) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'SKU-KEYB', 'Mechanical Keyboard', 'Tactile, hot-swap', 12900, 50),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'SKU-MOUS', 'Wireless Mouse',      'Low-latency',       4900, 100),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'SKU-MNTR', '27-inch Monitor',     '1440p 144Hz',      29900, 20);

insert into orders (id, customer_id, status, total_cents) values
  ('bbbbbbbb-0000-0000-0000-000000000001',
   '33333333-3333-3333-3333-333333333333', 'PENDING', 17800);

insert into order_items (order_id, product_id, quantity, unit_price_cents) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1, 12900),
  ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002', 1, 4900);

insert into order_events (order_id, from_status, to_status, action, actor_id, actor_role) values
  ('bbbbbbbb-0000-0000-0000-000000000001', null, 'PENDING', 'create',
   '33333333-3333-3333-3333-333333333333', 'customer');
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat(db): add seed data"
```

---

### Task 4: Table tracking + relationships (metadata)

**Files:**
- Create: `hasura/metadata/databases/default/tables/tables.yaml`
- Create one file per table under `hasura/metadata/databases/default/tables/`:
  `public_users.yaml`, `public_products.yaml`, `public_orders.yaml`, `public_order_items.yaml`, `public_order_events.yaml`

- [ ] **Step 1: `tables.yaml` include list**

```yaml
- "!include public_users.yaml"
- "!include public_products.yaml"
- "!include public_orders.yaml"
- "!include public_order_items.yaml"
- "!include public_order_events.yaml"
```

- [ ] **Step 2: `public_users.yaml`**

```yaml
table:
  name: users
  schema: public
array_relationships:
  - name: orders
    using:
      foreign_key_constraint_on:
        column: customer_id
        table:
          name: orders
          schema: public
```

- [ ] **Step 3: `public_products.yaml`**

```yaml
table:
  name: products
  schema: public
```

- [ ] **Step 4: `public_orders.yaml`**

```yaml
table:
  name: orders
  schema: public
object_relationships:
  - name: customer
    using:
      foreign_key_constraint_on: customer_id
array_relationships:
  - name: items
    using:
      foreign_key_constraint_on:
        column: order_id
        table:
          name: order_items
          schema: public
  - name: events
    using:
      foreign_key_constraint_on:
        column: order_id
        table:
          name: order_events
          schema: public
```

- [ ] **Step 5: `public_order_items.yaml`**

```yaml
table:
  name: order_items
  schema: public
object_relationships:
  - name: order
    using:
      foreign_key_constraint_on: order_id
  - name: product
    using:
      foreign_key_constraint_on: product_id
```

- [ ] **Step 6: `public_order_events.yaml`**

```yaml
table:
  name: order_events
  schema: public
object_relationships:
  - name: order
    using:
      foreign_key_constraint_on: order_id
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(hasura): track tables and FK relationships"
```

---

### Task 5: Docker Compose

**Files:**
- Create: `infra/docker/compose.yaml`

- [ ] **Step 1: `infra/docker/compose.yaml`**

```yaml
name: orderflow

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

  hasura:
    image: hasura/graphql-engine:v2.42.0.cli-migrations-v3
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "8080:8080"
    volumes:
      - ../../hasura/migrations:/hasura-migrations
      - ../../hasura/metadata:/hasura-metadata
    environment:
      HASURA_GRAPHQL_DATABASE_URL: ${HASURA_GRAPHQL_DATABASE_URL}
      PG_DATABASE_URL: ${PG_DATABASE_URL}
      HASURA_GRAPHQL_ADMIN_SECRET: ${HASURA_GRAPHQL_ADMIN_SECRET}
      HASURA_GRAPHQL_ENABLE_CONSOLE: "true"
      HASURA_GRAPHQL_DEV_MODE: "true"
      HASURA_GRAPHQL_ENABLED_LOG_TYPES: startup, http-log, webhook-log, websocket-log, query-log
    healthcheck:
      test: ["CMD-SHELL", "timeout 3 bash -c '</dev/tcp/localhost/8080' || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 20

volumes:
  pgdata:
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat(infra): add Postgres + Hasura docker compose"
```

---

### Task 6: Makefile + seed loading

**Files:**
- Create: `Makefile`

- [ ] **Step 1: `Makefile`**

```makefile
COMPOSE := docker compose --env-file .env -f infra/docker/compose.yaml
PSQL := $(COMPOSE) exec -T postgres psql -U $$(grep POSTGRES_USER .env | cut -d= -f2) -d $$(grep POSTGRES_DB .env | cut -d= -f2)

.PHONY: env up down logs seed smoke reset console

env:
	@test -f .env || cp .env.example .env

up: env
	$(COMPOSE) up -d
	@echo "Waiting for Hasura to be healthy..."
	@until [ "$$(docker inspect -f '{{.State.Health.Status}}' orderflow-hasura-1 2>/dev/null)" = "healthy" ]; do sleep 2; done
	@echo "Up. GraphQL: http://localhost:8080/v1/graphql  Console: http://localhost:8080/console"

down:
	$(COMPOSE) down

reset:
	$(COMPOSE) down -v

logs:
	$(COMPOSE) logs -f --tail=100

seed:
	cat hasura/seeds/default/*/up.sql | $(PSQL)

smoke:
	./infra/docker/smoke-test.sh

console:
	cd hasura && hasura console
```

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat(infra): add Makefile for local dev workflow"
```

---

### Task 7: Smoke test + bring-up verification

**Files:**
- Create: `infra/docker/smoke-test.sh` (executable)
- Modify: `README.md`

- [ ] **Step 1: `infra/docker/smoke-test.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

ADMIN_SECRET="$(grep HASURA_GRAPHQL_ADMIN_SECRET .env | cut -d= -f2)"
ENDPOINT="http://localhost:8080/v1/graphql"

query='{"query":"{ orders { id status total_cents customer { display_name role } items { quantity product { sku } } events { to_status } } }"}'

echo "→ Querying $ENDPOINT"
resp="$(curl -s -H "x-hasura-admin-secret: ${ADMIN_SECRET}" -H 'Content-Type: application/json' -d "$query" "$ENDPOINT")"
echo "$resp"

echo "$resp" | grep -q '"status":"PENDING"' || { echo "FAIL: expected a PENDING order"; exit 1; }
echo "$resp" | grep -q '"sku":"SKU-KEYB"' || { echo "FAIL: expected keyboard line item"; exit 1; }
echo "$resp" | grep -q '"role":"customer"' || { echo "FAIL: expected customer relationship"; exit 1; }
echo "✓ Smoke test passed: schema tracked, relationships resolve, seed data present."
```

- [ ] **Step 2: make executable**

Run: `chmod +x infra/docker/smoke-test.sh`

- [ ] **Step 3: bring it up, seed, and smoke test**

Run:
```bash
cd /Users/hasura/orderflow
cp -n .env.example .env || true
docker compose --env-file .env -f infra/docker/compose.yaml up -d
# wait for healthy, then:
make seed
make smoke
```
Expected: migrations + metadata applied on boot; seed inserts succeed; smoke test prints `✓ Smoke test passed`.

- [ ] **Step 4: Update `README.md`** — mark M2 done, add quick-start.

Add under Status: `- **M2 — Data layer (Postgres + Hasura)** ✅`
Add a "Run the stack" section documenting `make up && make seed && make smoke`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(infra): add data-layer smoke test and quick-start docs"
```

---

## Self-Review

- Schema covers every entity in spec §2.2 (users, products, orders, order_items, order_events) with money-as-cents, uuid pks, FK integrity, status enum, audit table, updated_at trigger. ✅
- Migrations/metadata are versioned and auto-applied (cli-migrations image) — no console mutations. ✅
- Relationships let the API traverse order→customer/items/events, matching the read paths the dashboard needs in M4. ✅
- Permissions deferred to M4 (need Keycloak JWT). Explicitly noted; M2 uses admin secret. ✅
- Verifiable end-to-end via `make up && make seed && make smoke`. ✅
