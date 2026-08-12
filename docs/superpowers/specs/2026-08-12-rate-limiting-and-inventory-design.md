# Rate Limiting and Inventory Management Service: Design Spec

> Status: **Approved for planning** · Date: 2026-08-12
> Supersedes the stock-handling portion of the M3 design and of ADR-0005.

Two independent features. Rate limiting is small and ships first. The Inventory
Management Service is a full sub-project and is the substantial piece of work.

---

## 1. Goals

**Rate limiting.** Bound how much work a single caller can trigger, without breaking
retries, probes, or metric scrapes.

**Inventory service.** Introduce a genuine second bounded context that owns stock, with
reserved-versus-available semantics, integrated with order placement and cancellation,
plus low-stock alerting and a reorder loop.

**Non-goals.** No supplier or purchase-order integration (a mock supplier would be
theatre). No warehouse locations or bin management. No partial shipment.

---

## 2. Part A: Rate limiting

### 2.1 Decision

Enforce in the services with `@nestjs/throttler`, keyed on the Hasura-forwarded user id
with an IP fallback. Hasura's own per-role rate limiting is an Enterprise feature and is
unavailable on the open-source engine this project runs, so the service is the correct
place for an application-level limit.

### 2.2 Rules

| Route class | Limit | Rationale |
|---|---|---|
| Order actions (`/actions/*`) | 30 per minute per caller | Bounds expensive transactional work |
| Inventory commands (`/inventory/*`) | 60 per minute per caller | Cheaper, called by the order service |
| `/events/*` | **exempt** | Hasura retries failed events; throttling would sabotage at-least-once delivery |
| `/health`, `/metrics` | **exempt** | Probes and Prometheus poll every 5 seconds and would trip any sane limit |

### 2.3 Key resolution

Prefer `session_variables['x-hasura-user-id']` from the Action body. Fall back to the
request IP when absent. This stops one heavy user from consuming the shared budget of
everyone behind the same address.

### 2.4 Observability

A throttled request returns HTTP 429 with the structured shape the project already uses:
`{ message, extensions: { code: "rate-limited" } }`.

Because 429 is below 500, the existing metrics interceptor classifies it as
`client_error`, so **throttling does not burn the availability error budget**. That is
correct: refusing excess load is the system working, not failing. A dedicated
`orderflow_throttled_total{route}` counter keeps it visible.

---

## 3. Part B: Inventory service, ownership and data

### 3.1 Service

`apps/inventory-service`, NestJS, port **3002**, following the existing workflow-service
patterns: zod-validated config, shared-secret guard, structured errors, pino logging,
Prometheus metrics, OpenTelemetry traces.

### 3.2 Database

Its own database, `ecommerce_orderflow_inventory`, in the same PostgreSQL instance locally
and a separate Cloud SQL database in production.

This is a deliberate choice, not a shortcut. PostgreSQL cannot perform cross-database joins
or transactions, so a second database **enforces** the bounded context at the engine level.
The boundary cannot be quietly violated later by someone adding a convenient join.

### 3.3 Schema

```sql
create table stock_items (
  product_id     uuid primary key,           -- mirrors the catalog id; no FK, different DB
  sku            text not null unique,
  on_hand        integer not null default 0 check (on_hand >= 0),
  reserved       integer not null default 0 check (reserved >= 0),
  reorder_level  integer not null default 0 check (reorder_level >= 0),
  reorder_qty    integer not null default 0 check (reorder_qty >= 0),
  updated_at     timestamptz not null default now(),
  constraint reserved_within_on_hand check (reserved <= on_hand)
);
-- available is always derived: on_hand - reserved. It is never stored.

create type reservation_status as enum ('HELD', 'RELEASED', 'COMMITTED');

create table reservations (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null,
  product_id  uuid not null references stock_items(product_id),
  quantity    integer not null check (quantity > 0),
  status      reservation_status not null default 'HELD',
  expires_at  timestamptz,                   -- null once confirmed by the order service
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (order_id, product_id)              -- gives idempotency for free
);

create type movement_kind as enum ('RESERVE','RELEASE','COMMIT','RECEIVE','ADJUST');

create table stock_movements (               -- append only, mirrors order_events
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

create type alert_level  as enum ('LOW','OUT_OF_STOCK');
create type alert_status as enum ('OPEN','RESOLVED');

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
-- at most one OPEN alert per product
create unique index stock_alerts_one_open_per_product
  on stock_alerts (product_id) where status = 'OPEN';

create table processed_events (              -- inbound event idempotency
  event_id     text primary key,
  processed_at timestamptz not null default now()
);
```

### 3.4 The catalog refactor this forces

`products.stock_qty` in the order database must be **removed**. Two sources of truth for
stock is precisely the bug this feature exists to prevent.

- `products` keeps `id`, `sku`, `name`, `description`, `unit_price_cents`.
- Stock lives only in `stock_items`.
- The dashboard reads both, because Hasura supports multiple data sources: the inventory
  database is tracked as a second source named `inventory`, exposed through the same
  GraphQL endpoint with the same role-based permissions.
- `OrdersService.reserveStock` is deleted; reservation moves to the saga below.

---

## 4. Part C: The saga

Because the two services own separate databases, a single transaction spanning both is
impossible. Consistency is achieved with reservation, compensation, and a sweeper.

### 4.1 Synchronous path: placing an order

The user is waiting, so the answer must be immediate.

```
placeOrder
  1. workflow generates orderId
  2. workflow → POST inventory /reservations { orderId, items }   (idempotent on orderId)
       inventory, in one local transaction:
         SELECT ... FOR UPDATE on each stock_item
         if any available < qty  → 409 insufficient-stock, nothing written
         else: insert reservations (HELD, expires_at = now() + 5 min)
               reserved += qty
               insert stock_movements (RESERVE)
  3. 409 → workflow returns insufficient-stock to the user, NO order is created
     200 → workflow creates the order in its own transaction
  4. after the order commits → workflow → POST /reservations/{orderId}/confirm
       clears expires_at, making the hold indefinite
  5. if step 3's transaction fails → workflow calls the compensating release
     if that compensation also fails → the sweeper (4.3) reclaims it
```

### 4.2 Asynchronous path: lifecycle changes

Nobody is waiting, and the work must survive failure. The existing `order_events` table
gains a **second** Hasura Event Trigger pointing directly at the inventory service. One
table, two independent consumers, which is exactly what event fan-out is for.

| Order event | Inventory action |
|---|---|
| `to_status = CANCELLED` | release: `reserved -= qty`, reservation `RELEASED`, `RELEASE` movement |
| `to_status = SHIPPED` | commit: `on_hand -= qty`, `reserved -= qty`, reservation `COMMITTED`, `COMMIT` movement |

Both are idempotent on the Hasura delivery id via `processed_events`, and additionally
guarded by the reservation status so a replay cannot double-apply.

### 4.3 The sweeper

A scheduled task inside the inventory service releases `HELD` reservations whose
`expires_at` has passed. This covers exactly one window: the crash between a successful
reservation and the order being created. Confirmed reservations have a null `expires_at`
and are never swept.

### 4.4 Consistency properties, stated honestly

- **Overselling is prevented** by the row lock plus the `reserved <= on_hand` constraint.
- **Order and stock are eventually consistent.** A cancelled order releases its stock when
  the event is delivered, not at the instant of cancellation.
- **The worst case is temporary over-reservation**, never overselling: stock can be held
  slightly longer than strictly necessary, which is the safe direction to fail.

---

## 5. Part D: Alerts and reordering

After any movement that lowers availability, the service evaluates the item:

- `available <= 0` → `OUT_OF_STOCK`
- `available <= reorder_level` → `LOW`

An alert opens only if no `OPEN` alert already exists for that product, enforced by a
partial unique index rather than by application logic. `suggested_qty` is
`max(reorder_qty, reorder_level * 2 - available)`.

Ops resolve an alert by receiving stock: `POST /inventory/receive` writes a `RECEIVE`
movement, raises `on_hand`, and resolves the open alert if availability recovers. That is a
complete loop without inventing a supplier integration.

### Observability

- `inventory_on_hand{sku}`, `inventory_reserved{sku}`, `inventory_available{sku}` gauges
- `inventory_reservations_total{outcome}`, `inventory_movements_total{kind}` counters
- `inventory_alerts_open` gauge
- Prometheus rule `OrderflowStockOutOfStock` (warning) when any item has zero availability
- A Grafana panel for availability and open alerts

---

## 6. Testing

| Level | Coverage |
|---|---|
| Unit | availability math, alert-level evaluation, suggested quantity |
| Integration (Testcontainers) | reserve success and rejection, idempotent re-reserve, release, commit, sweeper expiry, concurrent reservations on the same item |
| Cross-service integration | place order reserves stock; cancel releases it; ship commits it |
| End to end | placing an order visibly reduces availability in the dashboard |

Approximately 6 existing workflow-service integration tests assert the old in-transaction
stock behaviour and will be rewritten against the new saga.

---

## 7. Documentation impact

| Document | Change |
|---|---|
| `docs/adr/0005-sole-writer-audit.md` | Amended: the sole-writer and audit invariants stand; the in-transaction stock claim is superseded |
| `docs/adr/0007-inventory-bounded-context.md` | New: why a separate database, and the consistency trade accepted |
| `docs/adr/0008-rate-limiting-placement.md` | New: why the service layer, and why events and probes are exempt |
| `docs/ARCHITECTURE.md` | Diagrams, component reference, data model, a new saga flow, status, tests, ports, repo map |
| `README.md`, `PROJECT_CONTEXT.md` | Status, ports, commands |
| `SECURITY.md` | Rate limiting is no longer listed as a deliberate omission |
| `docs/slo.md` | New alert rule listed |

---

## 8. Build order

1. **Part A**, rate limiting, verified.
2. **Part B and C**, inventory service, database, saga, catalog refactor, verified end to end.
3. **Part D**, alerts, reordering, observability, verified.
4. Documentation updated across the board.

Each part is independently verifiable and is committed before the next begins.
