# Ecommerce OrderFlow

An e-commerce **order management** platform, built from scratch to demonstrate
backend, DevOps, cloud, and observability engineering.

> **New here?** Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) — the single source of
> truth for architecture, decisions, status, and how to continue. The full design
> spec lives in [`docs/superpowers/specs/`](docs/superpowers/specs/).

## Status

- **M1 — Monorepo foundation + domain state machine** ✅
- **M2 — Data layer (Postgres + Hasura)** ✅
- **M3 — Order Workflow Service (NestJS actions + events)** ✅

## Development

Requires Node 22 and pnpm 9.

```bash
pnpm install
pnpm test        # run all package tests
pnpm typecheck   # type-check every package
pnpm lint        # lint every package
```

## Run the data layer

Requires Docker. Brings up Postgres + Hasura, auto-applies versioned migrations
and metadata, seeds sample data, and serves GraphQL.

```bash
make up      # start Postgres + Hasura (migrations + metadata applied on boot)
make seed    # load sample users, products, and an order
make smoke   # verify the GraphQL API returns the seeded data with relationships
make down    # stop; `make reset` also drops the data volume
```

`make up` now also builds and starts the **workflow service**, so order actions work:

- GraphQL endpoint: `http://localhost:8080/v1/graphql`
- Console: `http://localhost:8080/console`
- Workflow service: `http://localhost:3001` (`/health`)

### Order workflow (Hasura Actions → workflow service)

Business operations go through the NestJS service, the only writer of order state.
Call them via GraphQL with a role header (`x-hasura-role`) alongside the admin secret:

```graphql
# as customer (x-hasura-role: customer, x-hasura-user-id: <uuid>)
mutation { placeOrder(items: [{ productId: "<uuid>", quantity: 2 }]) { id status } }

# as ops (x-hasura-role: ops)
mutation { transitionOrder(orderId: "<uuid>", action: "confirm") { id status } }
```

Illegal or unauthorized transitions return a structured error
(`{ message, extensions: { code } }`); each transition writes an append-only
`order_events` audit row and fires an async event trigger back into the service.

> **First-boot note:** the `cli-migrations-v3` image applies metadata before
> migrations on its throwaway bootstrap server, so the *first* `make up` logs
> transient `Inconsistent Metadata!` warnings. The normal-mode server reconciles
> once the tables exist (`is_consistent: true`), and subsequent restarts boot
> clean. This is expected, not an error.

## Packages & apps

- `packages/domain` — framework-agnostic order state machine (the correctness core).
- `packages/config` — zod-validated environment loading.
- `apps/workflow-service` — NestJS service: the only writer of order state, exposed
  via Hasura Actions (sync) and Event Triggers (async). Testcontainers integration tests.

## Layout

- `hasura/` — versioned migrations, metadata, and seeds (applied in CI, never by hand).
- `infra/docker/` — Docker Compose stack and smoke test.
