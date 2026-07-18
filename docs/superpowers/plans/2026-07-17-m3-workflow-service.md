# M3 — Order Workflow Service (NestJS) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A NestJS service that is the **only writer of order state**. It exposes the domain
transitions as **Hasura Actions** (synchronous) and processes **Hasura Event Triggers**
(asynchronous side effects), enforcing authorization, invariants, atomic audit writes, and
idempotency — turning the read-only data layer into a real order-management workflow.

**Architecture:** `apps/workflow-service` (NestJS) consumes `@ecommerce-orderflow/domain`
for `applyTransition`. It talks to Postgres directly via `pg` behind a thin repository, so a
transition + its audit event commit in **one transaction**. Hasura calls it over HTTP:
Actions for synchronous mutations (`placeOrder`, `transitionOrder`), Event Triggers for
async work (notification stub, idempotent). Session variables (`x-hasura-role`,
`x-hasura-user-id`) authorize each call — pre-wiring the JWT claims that Keycloak supplies
in M4.

**Tech Stack:** NestJS 10, `pg` (node-postgres), zod, Vitest + Testcontainers, TypeScript.

## Global Constraints

- TypeScript, `strict`. Commits authored solely by the owner; no `Co-Authored-By`/AI mentions.
- The service is the **only** path that mutates `orders.status`; clients never call raw update.
- Transition + audit `order_events` insert happen in **one DB transaction**.
- All external input (Action args, Event payload, env) validated with **zod**; domain errors
  map to structured Hasura Action errors (`{message, extensions.code}`), never stack traces.
- Event handlers are **idempotent**, keyed on the Hasura delivery id.
- Migrations own the schema — new tables go through `hasura/migrations`.

## File structure

```
apps/workflow-service/
├── package.json, tsconfig.json, tsconfig.build.json, nest-cli.json, vitest.config.ts, Dockerfile
├── src/
│   ├── main.ts                      # bootstrap (port from config)
│   ├── app.module.ts
│   ├── config/config.module.ts      # zod-validated env (DATABASE_URL, PORT, ACTION_SECRET)
│   ├── db/
│   │   ├── db.module.ts             # pg Pool provider
│   │   ├── pool.ts                  # createPool(databaseUrl)
│   │   └── order.repository.ts      # getOrderForUpdate, updateStatus, insertEvent, createOrder, decrementStock, findProducts
│   ├── common/
│   │   ├── hasura-auth.guard.ts     # verifies shared ACTION_SECRET header
│   │   ├── session.ts               # parse x-hasura-role / x-hasura-user-id from Action payload
│   │   └── action-error.ts          # domain error → Hasura action error mapper
│   ├── orders/
│   │   ├── orders.module.ts
│   │   ├── orders.service.ts        # placeOrder(), transitionOrder() — the transactional core
│   │   ├── orders.controller.ts     # POST /actions/place-order, /actions/transition-order
│   │   └── dto.ts                   # zod schemas + inferred types for action payloads
│   └── events/
│       ├── events.module.ts
│       ├── events.controller.ts     # POST /events/order-event
│       └── events.service.ts        # idempotent side-effect handler
└── test/
    ├── order.repository.int.test.ts # Testcontainers: real Postgres + migrations
    └── orders.service.int.test.ts   # transition/authz/tx behavior against real DB
```

New migration: `processed_events` table for idempotency.

---

### Task 1: NestJS scaffold + config + db pool

- [ ] Create `apps/workflow-service/package.json` with deps: `@nestjs/common`, `@nestjs/core`,
      `@nestjs/platform-express`, `reflect-metadata`, `rxjs`, `pg`, `zod`,
      `@ecommerce-orderflow/domain` (workspace), `@ecommerce-orderflow/config` (workspace);
      dev: `@nestjs/cli`, `@nestjs/testing`, `@types/pg`, `@types/node`, `typescript`,
      `vitest`, `testcontainers`. Scripts: `build` (nest build), `start`, `start:dev`,
      `test` (vitest run), `lint`, `typecheck`.
- [ ] `tsconfig.json` extends base; enable `experimentalDecorators`, `emitDecoratorMetadata`.
- [ ] `nest-cli.json`, `main.ts` (bootstrap on `PORT`, default 3001), `app.module.ts`.
- [ ] `config/config.module.ts`: zod schema `{ DATABASE_URL, PORT(default 3001),
      ACTION_SECRET }`, provided as `APP_CONFIG` token.
- [ ] `db/pool.ts` + `db/db.module.ts`: a `pg.Pool` singleton provider (`PG_POOL` token) from
      `DATABASE_URL`.
- [ ] Verify: `pnpm --filter @ecommerce-orderflow/workflow-service build` succeeds.
- [ ] Commit: `feat(workflow): scaffold NestJS service with config and pg pool`.

### Task 2: Idempotency migration

- [ ] Create `hasura/migrations/default/1720000000002_processed_events/up.sql`:
  ```sql
  create table processed_events (
    event_id   text primary key,
    created_at timestamptz not null default now()
  );
  ```
  and `down.sql` (`drop table if exists processed_events;`).
- [ ] Commit: `feat(db): add processed_events table for event idempotency`.

### Task 3: Order repository (typed, transactional)

- [ ] `db/order.repository.ts` with a `withTransaction<T>(fn)` helper and methods, all
      parameterized SQL:
  - `getOrderById(id): OrderRow | null`
  - `getOrderForUpdate(client, id): OrderRow | null`  // `select ... for update`
  - `updateStatus(client, id, status): void`
  - `insertEvent(client, e): void`  // order_events row
  - `findProducts(ids): ProductRow[]`
  - `createOrder(client, {customerId, items, totalCents}): OrderRow`
  - `decrementStock(client, productId, qty): void`  // guarded `stock_qty >= qty`
- [ ] `test/order.repository.int.test.ts` (Testcontainers): start `postgres:16`, run the
      migration SQL, seed a product + user, assert createOrder/updateStatus/insertEvent and
      that `decrementStock` throws when stock is insufficient.
- [ ] Commit: `feat(workflow): add transactional order repository + integration tests`.

### Task 4: Orders service — the transactional core

- [ ] `orders/dto.ts`: zod schemas
  - `placeOrderSchema` = `{ items: [{ productId: uuid, quantity: int>0 }] (nonempty) }`
  - `transitionOrderSchema` = `{ orderId: uuid, action: enum(confirm|pack|ship|deliver|cancel|return) }`
  - `sessionSchema` = `{ role: enum(customer|ops|admin), userId: uuid.optional() }`
- [ ] `orders/orders.service.ts`:
  - `placeOrder(session, input)`: require role (any authenticated); load products; reject if
    any missing; compute `totalCents`; in a tx create order (PENDING) + items + initial
    `order_events(create → PENDING)`; return `{id, status}`.
  - `transitionOrder(session, input)`: in a tx `getOrderForUpdate`; **ownership check**
    (customer may only act on own order → else `ForbiddenTransitionError`); call
    `applyTransition({current: order.status, action, role})`; if `action==='confirm'`,
    verify + `decrementStock` for each item (throw `InsufficientStockError` if short);
    `updateStatus`; `insertEvent(from,to,action,actor)`; return `{id, status}`.
- [ ] `common/action-error.ts`: map `IllegalTransitionError`→code `illegal-transition`,
      `ForbiddenTransitionError`→`forbidden`, `InsufficientStockError`→`insufficient-stock`,
      else `internal`. (Add `InsufficientStockError` to `@ecommerce-orderflow/domain`.)
- [ ] `test/orders.service.int.test.ts` (Testcontainers): full lifecycle
      PENDING→CONFIRMED→…→DELIVERED as ops; customer-cancel-own PENDING ok; customer cancel
      others' → forbidden; confirm with insufficient stock → error; illegal transition → error.
- [ ] Commit: `feat(workflow): add order place/transition service with tx + audit`.

### Task 5: HTTP controllers (Actions + Events) + auth guard

- [ ] `common/hasura-auth.guard.ts`: reject requests without the shared `ACTION_SECRET`
      header (`x-action-secret`).
- [ ] `common/session.ts`: extract `session_variables` from the Hasura Action body →
      `{role, userId}` via `sessionSchema`.
- [ ] `orders/orders.controller.ts`:
  - `POST /actions/place-order` → validate `input`, parse session, call service, map errors.
  - `POST /actions/transition-order` → same.
  Hasura Action error shape on failure: `{ "message": ..., "extensions": { "code": ... } }`
  with HTTP 400.
- [ ] `events/events.controller.ts` + `events.service.ts`:
  - `POST /events/order-event`: read Hasura event `id`; `insert into processed_events on
    conflict do nothing`; if row already existed, return `{status:'skipped'}`; else perform
    side effect (log `notification.sent` with order id + new status) and return `{status:'ok'}`.
- [ ] Commit: `feat(workflow): add action + event HTTP controllers with auth + idempotency`.

### Task 6: Hasura wiring (custom types, actions, permissions, event trigger)

- [ ] `hasura/metadata/actions.graphql`: define
  ```graphql
  type Mutation {
    placeOrder(input: PlaceOrderInput!): OrderMutationResult
    transitionOrder(orderId: uuid!, action: String!): OrderMutationResult
  }
  ```
  with `input PlaceOrderInput { items: [OrderItemInput!]! }`,
  `input OrderItemInput { productId: uuid!, quantity: Int! }`,
  `type OrderMutationResult { id: uuid!, status: String! }`.
- [ ] `hasura/metadata/actions.yaml`: two actions, handler `http://workflow-service:3001/actions/...`,
      forward client headers, `headers: [{name: x-action-secret, value_from_env: ACTION_SECRET}]`,
      permissions for roles `customer`/`ops`/`admin` (customer: placeOrder + transitionOrder;
      ops/admin: transitionOrder). Define the `custom_types`.
- [ ] `hasura/metadata/databases/default/tables/public_order_events.yaml`: add an
      **event trigger** `order_event_created` on INSERT → `http://workflow-service:3001/events/order-event`,
      with the `ACTION_SECRET` header and retry config.
- [ ] Commit: `feat(hasura): wire actions, permissions, and order-event trigger`.

### Task 7: Compose wiring + env + live verification

- [ ] Add `workflow-service` to `infra/docker/compose.yaml`: build from
      `apps/workflow-service/Dockerfile`, env `DATABASE_URL` (PG), `ACTION_SECRET`, `PORT=3001`,
      `depends_on` postgres healthy; Hasura gets `ACTION_SECRET` + `HASURA_GRAPHQL_ACTION_BASE_URL`
      (or per-action full URL) env.
- [ ] Add `ACTION_SECRET` to `.env.example` / `.env`.
- [ ] `apps/workflow-service/Dockerfile`: multi-stage (pnpm build of the workspace → slim runtime).
- [ ] Verify live: `make up`; via GraphQL call `transitionOrder` on the seeded PENDING order as
      `ops` (headers `x-hasura-role: ops`, `x-hasura-admin-secret`) → status becomes CONFIRMED;
      a new `order_events` row exists; the event-trigger handler logged a notification. Then
      customer cancel of a non-owned order → structured `forbidden` error.
- [ ] Update `README.md` + `PROJECT_CONTEXT.md`: mark M3 done; document the two actions.
- [ ] Commit: `feat(workflow): containerize service and wire into the stack`.

---

## Self-Review
- Only-writer invariant, one-tx transition+audit, idempotent events, structured errors,
  ownership + role authz, Testcontainers integration coverage — all mapped to Tasks 3–6. ✅
- Session-variable authz pre-wires M4 (Keycloak JWT → same `x-hasura-*` claims). ✅
- New `processed_events` table via migration (schema stays migration-owned). ✅
