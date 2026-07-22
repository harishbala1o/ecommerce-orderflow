# Ecommerce OrderFlow

[![CI](https://github.com/harishbala1o/ecommerce-orderflow/actions/workflows/ci.yaml/badge.svg)](https://github.com/harishbala1o/ecommerce-orderflow/actions/workflows/ci.yaml)

An e-commerce **order management** platform, built from scratch to demonstrate
backend, DevOps, cloud, and observability engineering.

> **New here?** Read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) — the single source of
> truth for architecture, decisions, status, and how to continue. The full design
> spec lives in [`docs/superpowers/specs/`](docs/superpowers/specs/).

## Architecture

```
                         ┌──────────────────────────┐
   Browser ── Next.js ───┤  Keycloak (OIDC) → JWT    │  role claims in JWT
   dashboard             └──────────────────────────┘
        │ GraphQL (JWT bearer)
        ▼
   ┌─────────────┐   Actions (sync mutations)   ┌──────────────────────┐
   │   Hasura    │ ───────────────────────────▶ │  Order Workflow Svc  │
   │  (GraphQL,  │   Event Triggers (async)      │      (NestJS)        │
   │  subs, RBAC)│ ◀──────────────────────────── │  • state machine     │
   └──────┬──────┘                                │  • validation        │
          │ SQL                                   │  • audit + metrics   │
          ▼                                       └──────────┬───────────┘
   ┌─────────────┐                                           │ writes
   │  Postgres   │ ◀─────────────────────────────────────────┘
   └─────────────┘
```

**Reads** go straight through Hasura (row-level RBAC from JWT claims). **Business
operations** go through the workflow service — the sole writer of order state — as
synchronous Hasura Actions, with retryable side effects driven by asynchronous Event
Triggers. The order state machine lives in a framework-agnostic package shared by the
service and the dashboard.

The *why* behind each major choice is recorded as [Architecture Decision Records](docs/adr/).

## Status

- **M1 — Monorepo foundation + domain state machine** ✅
- **M2 — Data layer (Postgres + Hasura)** ✅
- **M3 — Order Workflow Service (NestJS actions + events)** ✅
- **M4 — Auth (Keycloak + JWT RBAC) + dashboard (Next.js) + E2E** ✅
- **M5a — Observability (Prometheus metrics, OpenTelemetry traces, Grafana)** ✅
- **M5b — CI (GitHub Actions: quality gate, image publish to GHCR, E2E)** ✅
- **M5c — Kubernetes (Helm chart + kind, HPA/NetworkPolicy, prod overlay)** ✅
- **M5d — ADRs + architecture docs** ✅

**Phase 1 complete.**

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

`make up` starts the full backend: Postgres, **Keycloak** (OIDC), Hasura, and the
**workflow service**.

| Service | URL |
|---|---|
| GraphQL endpoint | `http://localhost:8080/v1/graphql` |
| Hasura console | `http://localhost:8080/console` |
| Keycloak | `http://localhost:8081` |
| Workflow service | `http://localhost:3001` (`/health`) |
| Dashboard (dev) | `http://localhost:3000` |

## Run the dashboard

```bash
cd apps/web
cp .env.example .env.local   # first time
pnpm dev                     # http://localhost:3000
```

Sign in with one of the demo personas (dev-only credentials, password `demo1234`):

| Username | Role | Can do |
|---|---|---|
| `cara` | customer | Place orders, view/cancel own pending orders |
| `otto` | ops | See all orders, drive fulfillment (confirm → deliver, returns) |
| `ada` | admin | Everything, incl. force-cancel of shipped orders |

Auth flow: Keycloak issues a JWT whose claims (`sub`, realm roles, a
`hasura_default_role` attribute) map to Hasura session variables via `claims_map`.
Row-level permissions scope every query — a customer can only ever see their own
orders. The dashboard derives its action buttons from the domain transition table,
so the UI cannot offer an illegal transition; the workflow service re-validates
every action server-side regardless.

### Order workflow (Hasura Actions → workflow service)

Business operations go through the NestJS service, the only writer of order state.
Illegal or unauthorized transitions return a structured error
(`{ message, extensions: { code } }`); each transition writes an append-only
`order_events` audit row and fires an async event trigger back into the service.

## Observability

```bash
make obs-up   # full stack + Prometheus, Tempo, Grafana; enables trace export
```

- **Grafana** (anonymous, dev): http://localhost:3300 → dashboard *OrderFlow — Service & Domain*
- **Prometheus**: http://localhost:9090 · **Tempo** (traces): queried via Grafana

Three pillars, correlated:
- **Metrics** — the workflow service exposes `/metrics`: RED (request rate, p95
  latency, error rate by route) plus **domain metrics** (`orderflow_transitions_total`
  by action/from/to/role, `orderflow_orders_placed_total`).
- **Traces** — OpenTelemetry auto-instruments HTTP/Express/pg, with a manual
  `order.transition` span, exported to Tempo. One trace spans Action → service → Postgres.
- **Logs** — structured pino JSON carrying the active `trace_id`, so a log line links
  to its trace.

## End-to-end tests

With the stack up (`make up && make seed`):

```bash
cd apps/web && pnpm test:e2e   # Playwright: full lifecycle + RBAC isolation
```

> **First-boot note:** the `cli-migrations-v3` image applies metadata before
> migrations on its throwaway bootstrap server, so the *first* `make up` logs
> transient `Inconsistent Metadata!` warnings. The normal-mode server reconciles
> once the tables exist (`is_consistent: true`), and subsequent restarts boot
> clean. This is expected, not an error.

## Packages & apps

- `packages/domain` — framework-agnostic order state machine (the correctness core).
- `packages/config` — zod-validated environment loading.
- `packages/graphql-client` — typed GraphQL operations (graphql-codegen, committed output).
- `apps/workflow-service` — NestJS service: the only writer of order state, exposed
  via Hasura Actions (sync) and Event Triggers (async). Testcontainers integration tests.
- `apps/web` — Next.js dashboard: Keycloak sign-in, role-aware order workflow UI,
  Playwright E2E.

## Layout

- `hasura/` — versioned migrations, metadata, and seeds (applied in CI, never by hand).
- `infra/docker/` — Docker Compose stack and smoke test.
- `infra/keycloak/` — imported realm (roles, demo users, dashboard client).
