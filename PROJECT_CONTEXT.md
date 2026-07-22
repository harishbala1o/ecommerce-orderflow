# Ecommerce OrderFlow — Project Context & Onboarding Guide

> **Single source of truth** for anyone — human or AI — picking up this project.
> Read this first, then the design spec in [`docs/superpowers/specs/`](docs/superpowers/specs/).
>
> **Last updated:** 2026-07-20 · **Current milestone:** Phase 1 complete (M1–M5). Phase 2 (Terraform→GKE) is the next arc.
>
> **How to maintain this doc:** update the *Status* table and *Changelog* whenever a
> milestone lands or a significant decision changes. Keep sections concise — link to
> the spec/plans for detail rather than duplicating them.

---

## 1. Project overview & objectives

**Ecommerce OrderFlow** is an e-commerce **order management** platform (the operations side, not a
storefront) built from scratch as a flagship portfolio project. Its objective is to
demonstrate — credibly and in a way that reads as *thoughtfully engineered, not
AI-generated* — real skills across **backend engineering, DevOps, cloud, and
observability**.

**Success criteria:**
- Runnable in minutes (`make up`) and demoable end-to-end.
- Discussable in depth in an interview: every major decision has a stated "why".
- Broad in scope but deep where it counts (the order state machine is rigorously tested).
- Clean, human-looking git history authored solely by the project owner.

## 2. Problem statement & business context

E-commerce operations teams need to move orders through a fulfillment lifecycle
(placed → confirmed → packed → shipped → delivered, with cancellations and returns),
with **different people allowed to do different things** and a **reliable audit trail**
of who changed what. The reference inspiration is Appsmith's "e-commerce order
management dashboard with Hasura and GraphQL" blog, but Ecommerce OrderFlow is built from scratch
with modern tooling rather than a low-code tool — the point is to *show the engineering*.

The core domain problem is **workflow correctness**: order state must only change through
**valid, authorized transitions**, and every change must be recorded. That invariant is
the heart of the project.

## 3. Current architecture & key design decisions

```
                         ┌──────────────────────────┐
   Browser ── Next.js ───┤  Keycloak (OIDC) → JWT    │  role claims in JWT
   dashboard (M4 ✅)      └──────────────────────────┘
        │ GraphQL (JWT bearer)
        ▼
   ┌─────────────┐   Actions (sync mutations)   ┌──────────────────────┐
   │   Hasura    │ ───────────────────────────▶ │  Order Workflow Svc  │
   │  (GraphQL,  │   Event Triggers (async)      │   (NestJS) — M3       │
   │  subs, RBAC)│ ◀──────────────────────────── │  • state machine     │
   └──────┬──────┘                                │  • validation        │
          │ SQL                                   │  • event handlers    │
          ▼                                       └──────────┬───────────┘
   ┌─────────────┐                                           │ writes
   │  Postgres   │ ◀─────────────────────────────────────────┘
   └─────────────┘
```

**Foundational decisions (the "why"):**
1. **Hasura for data access + a dedicated service for invariants.** Reads and simple
   writes go through Hasura's generated GraphQL with row-level permissions. Business
   operations (state transitions) go through a NestJS service that is the *only* writer
   of order state. Rationale: use the right tool per concern; don't reinvent CRUD, but
   don't let business rules leak into the client or raw mutations.
2. **Sync vs async split.** Synchronous **Hasura Actions** when the caller needs the
   result (the new order state); asynchronous **Event Triggers** for retryable side
   effects (audit, stock decrement, notifications). Keeps mutations fast; side effects
   survive retries.
3. **State machine as a pure, framework-agnostic package** (`packages/domain`). Gates on
   `role` + `status` only; **ownership checks are a service concern**, keeping the domain
   trivially unit-testable. This is the correctness core.
4. **`isTerminal` is derived from the transition table** (terminal iff no outgoing rule),
   so it can never drift. Terminal = `{CANCELLED, RETURNED}`; `DELIVERED` is
   *completed-but-reversible* (a return can still be initiated).
5. **TypeScript end-to-end**, monorepo (pnpm + Turborepo), TDD, frequent small commits.

Full rationale lives in the design spec §3–§10 and will be captured as ADRs under
`docs/adr/` (see the ADR index there).

## 4. Tech stack & rationale

| Layer | Choice | Why |
|---|---|---|
| Data store | **PostgreSQL 16** | Relational integrity for orders/items/events; native enum for status |
| GraphQL API | **Hasura graphql-engine v2.42** | Auto-generated CRUD + subscriptions + declarative RBAC; versioned metadata/migrations |
| Workflow service | **NestJS (TypeScript)** | Structured modules/DI → a real "clean architecture" story; unifies language with frontend |
| Auth/IdP | **Keycloak 25** (M4 ✅) | Self-hosted OIDC; real IAM; JWT role claims into Hasura; strong DevOps signal |
| Frontend | **Next.js 14 + React + TS** (M4 ✅) | Industry default for dashboards; pairs with typed GraphQL client |
| GraphQL client | **graphql-codegen + urql** (M4 ✅) | Typed operations; lighter than Apollo |
| Validation | **zod** | Fail-fast env + boundary validation with readable errors |
| Monorepo | **pnpm workspaces + Turborepo** | One clone runs everything; cached task graph |
| Tests | **Vitest** (unit), **Testcontainers** (integration, M3), **Playwright** (E2E, M4) | Fast unit cycle; real Postgres in integration; true E2E |
| Local dev | **Docker Compose + Make** | One-command reproducible environment |
| CI/CD | **GitHub Actions** (planned M5) | Lint/typecheck/test → build → GHCR → E2E |
| Orchestration | **Helm + kind** (planned M5), **GKE** (planned Phase 2) | Real deploy target; local-runnable |
| IaC | **Terraform → GKE Autopilot** (planned Phase 2) | Reproducible infra; spin-up/down for cost |
| Observability | **pino→Loki, Prometheus, OpenTelemetry→Tempo, Grafana** (planned M5) | One coherent pane; RED + domain metrics; cross-service traces |

## 5. Features implemented & status

| # | Milestone | Scope | Status |
|---|---|---|---|
| M1 | Foundation + domain state machine | Monorepo, config package, order state machine + 18 tests | ✅ **Done** |
| M2 | Data layer | Postgres schema + migrations, Hasura tracking + relationships, seed, Docker Compose, smoke test | ✅ **Done** |
| M3 | Workflow service | NestJS service, Hasura Actions (sync transitions), Event Triggers (async side effects), idempotency, Testcontainers integration tests | ✅ **Done** |
| M4 | Auth + dashboard | Keycloak, JWT→Hasura claims, per-role RBAC permissions, Next.js dashboard, typed GraphQL client, Playwright E2E | ✅ **Done** |
| M5 | Observability + CI + k8s | Logging/metrics/tracing/Grafana, GitHub Actions CI, Helm + kind deploy, README + ADRs | ⏳ **Next** |
| P2 | Production-shaped | Terraform → GKE, HPA, NetworkPolicy, alerting, CD | ☐ Future |
| P3 | Depth flourishes | Inventory service, SLOs, k6 load tests, canary rollout | ☐ Future (optional) |

**What works today:** the domain logic (unit-tested), the data layer (live GraphQL API,
relationships, subscriptions), and the **workflow service** — `placeOrder` and
`transitionOrder` run through Hasura Actions into NestJS, which applies the state machine,
writes the audit event, and reserves stock atomically; an async Event Trigger fires back
into the service on every `order_events` insert (idempotent). Verified end-to-end via the
running stack, plus real authentication and a dashboard: Keycloak (OIDC) issues JWTs,
Hasura enforces per-role row-level permissions from the claims, and the Next.js
dashboard (personas cara/otto/ada, password `demo1234`) drives the whole lifecycle.
Playwright E2E covers the full flow and RBAC isolation. **Not yet built:**
observability, CI, deployment (M5+); dashboard not yet containerized (M5).

## 6. Repository structure

```
ecommerce-orderflow/
├── package.json, pnpm-workspace.yaml, turbo.json   # monorepo tooling
├── tsconfig.base.json, eslint.config.mjs           # shared TS/lint config
├── Makefile                                         # up / down / seed / smoke / reset
├── .env.example                                     # env template (copy to .env)
├── README.md                                        # quick-start
├── PROJECT_CONTEXT.md                               # ← this file
├── apps/
│   └── workflow-service/  # ★ NestJS: only writer of order state; Actions + Event handlers
│       ├── src/ config · db (pool, repository, tokens) · common (guard, session, error map) · orders · events
│       └── test/ Testcontainers integration tests · Dockerfile
├── packages/
│   ├── domain/          # ★ order state machine (pure, framework-agnostic, 19 tests)
│   │   └── src/ order-status.ts · roles.ts · transitions.ts · errors.ts · state-machine.ts · index.ts (+ *.test.ts)
│   └── config/          # zod-validated env loader
├── hasura/
│   ├── config.yaml
│   ├── migrations/default/…_init, …_processed_events/  # schema (up.sql / down.sql)
│   ├── metadata/                                     # tracked tables, relationships, actions, event trigger
│   └── seeds/default/1720000000001_seed/up.sql      # sample data
├── infra/
│   └── docker/ compose.yaml · smoke-test.sh
└── docs/
    └── superpowers/
        ├── specs/2026-07-17-ecommerce-orderflow-design.md      # the approved design
        └── plans/2026-07-17-m1-*.md, m2-*.md          # implementation plans
```

**Most important files:** `packages/domain/src/transitions.ts` (the transition table +
role gates — the crux), `packages/domain/src/state-machine.ts` (`applyTransition`),
`hasura/migrations/.../up.sql` (schema), `infra/docker/compose.yaml`, and the design spec.

## 7. APIs, data models, workflows & integrations

### Data model (Postgres)
- **`users`** — mirrors Keycloak subjects (`keycloak_id`), `email`, `display_name`, `role` (`customer|ops|admin`).
- **`products`** — `sku`, `name`, `unit_price_cents`, `stock_qty` (money as integer cents).
- **`orders`** — `customer_id → users`, `status` (enum `order_status`), `total_cents`, `updated_at` (trigger-maintained).
- **`order_items`** — `order_id → orders` (cascade), `product_id → products`, `quantity`, `unit_price_cents` (price captured at order time).
- **`order_events`** — **append-only audit**: `from_status`, `to_status`, `action`, `actor_id`, `actor_role`, `reason`, `correlation_id`.

### Order state machine (the core workflow)
Statuses: `PENDING → CONFIRMED → PACKED → SHIPPED → DELIVERED`, plus `CANCELLED` and
`RETURNED`. Actions and role gates (see `packages/domain/src/transitions.ts`):

| Action | From → To | Allowed roles |
|---|---|---|
| confirm | PENDING → CONFIRMED | ops, admin |
| pack | CONFIRMED → PACKED | ops, admin |
| ship | PACKED → SHIPPED | ops, admin |
| deliver | SHIPPED → DELIVERED | ops, admin |
| cancel | PENDING → CANCELLED | customer, ops, admin |
| cancel | CONFIRMED/PACKED → CANCELLED | ops, admin |
| cancel | SHIPPED → CANCELLED | **admin only** (force-cancel) |
| return | DELIVERED → RETURNED | ops, admin |

`applyTransition({current, action, role})` returns `{from, to, action}` or throws
`IllegalTransitionError` (no such transition) / `ForbiddenTransitionError` (role not
permitted). `canTransition(from, action)` is a **structural** check that ignores roles —
use `applyTransition` for authorization.

### GraphQL API (Hasura)
- Endpoint: `http://localhost:8080/v1/graphql` · Console: `http://localhost:8080/console`.
- Tracked tables + FK relationships: `orders.customer`, `orders.items`, `orders.events`,
  `order_items.order/product`, `users.orders`, `order_events.order`.
- **Action mutations** (→ workflow service): `placeOrder(items)`,
  `transitionOrder(orderId, action)`. Reads/filters/aggregates/subscriptions work admin-only.

### Workflow service actions & events (M3, implemented)
- **Sync Actions**: `placeOrder`, `transitionOrder` → `POST /actions/*` on the NestJS
  service (shared `x-action-secret`). The service loads the order `FOR UPDATE`, checks
  ownership, applies the domain state machine, reserves stock on `confirm`, updates status,
  and appends an `order_events` audit row — all in one transaction. Domain errors map to
  `{ message, extensions: { code } }`.
- **Async Event Trigger** `order_event_created`: fires on every `order_events` INSERT →
  `POST /events/order-event`; idempotent via `processed_events` (deduped on Hasura delivery
  id). Note: because it's a DB-level trigger, the service's own direct-SQL inserts fire it too.

### Integrations (planned)
- **Keycloak JWKS → Hasura** (JWT validation) and **claims_map → Hasura RBAC** — live since M4: allowed roles from realm roles, default role from a `hasura_default_role` user attribute, user id from `sub` (Keycloak user ids are fixed equal to seeded `users.id`).

## 8. Infrastructure, deployment, CI/CD & environment

- **Local:** Docker Compose (`infra/docker/compose.yaml`) runs Postgres 16 + Hasura
  (`cli-migrations-v3` image, which auto-applies migrations + metadata on boot). `Makefile`
  is the front door.
- **Environment:** copy `.env.example` → `.env`. Keys: `POSTGRES_*`,
  `HASURA_GRAPHQL_ADMIN_SECRET`, `HASURA_GRAPHQL_DATABASE_URL`, `PG_DATABASE_URL`. `.env`
  is git-ignored; only `.env.example` (safe dev placeholders) is committed.
- **Requirements:** Node 22, pnpm 9, Docker (Compose v2+).
- **CI/CD, Kubernetes, IaC, observability:** not yet built — planned for M5 / Phase 2
  (see Status table). Design intent is documented in the spec §5.

## 9. Known limitations, tech debt, pending tasks & future enhancements

**Current limitations (by design, not bugs):**
- The dashboard runs via `pnpm dev` locally (a production image + Helm deploy exist in M5c).
- Realtime subscriptions deferred — the dashboard refetches after mutations.

**Known quirks:**
- First `make up` logs transient `Inconsistent Metadata!` warnings (the `cli-migrations-v3`
  image applies metadata before migrations on its bootstrap server). The normal-mode
  server reconciles once tables exist (`is_consistent: true`); restarts boot clean. Not an
  error — documented in the README.

**Tech debt / to revisit:**
- Seed uses fixed UUIDs for repeatable smoke tests — fine for dev; not for prod.
- Workflow-service Docker image uses a single-registry `pnpm deploy` build; fine, but a
  slimmer multi-stage runtime could be tuned further in M5.

**Future enhancements:** inventory as a second bounded context, SLO/error-budget
dashboards, k6 load testing, canary/blue-green rollout, transactional-outbox writeup (all P3).

## 10. Key discussions, assumptions & decisions

- **Positioning:** optimize for a broad backend + DevOps + cloud + observability story, but
  achieve breadth via *phasing* (deep vertical slice first) rather than shipping everything
  shallow — the latter reads as AI-generated.
- **Hasura + custom service (not Hasura-only, not hand-rolled GraphQL):** chosen to show the
  production Hasura boundary pattern *and* real backend code. Owner works at Hasura; this
  demonstrates knowing where the tool stops.
- **Keycloak over managed auth:** more infra to run, but a stronger self-hosted IAM signal.
- **GKE over EKS:** cleaner Terraform, cheaper (Autopilot), free credit. Not left running
  24/7 — deliberate spin-up/tear-down, documented honestly.
- **Attribution:** all commits are authored **solely by the project owner** (Harish Balaji,
  GitHub `harishbala1o`, via GitHub noreply email). **No AI/`Co-Authored-By` trailers** —
  ever. This is a hard rule for the repo.
- **Assumption:** `products`/inventory is a real table in Phase 1; a dedicated inventory
  *service* is deferred to P3.

## 11. Setup — run it locally (and prod intent)

### Local
```bash
# prerequisites: Node 22, pnpm 9, Docker
cd ecommerce-orderflow
pnpm install

# domain logic (no Docker needed)
pnpm test        # 22 tests   ·   pnpm typecheck   ·   pnpm lint

# data layer
cp .env.example .env       # first time (make up does this too)
make up          # Postgres + Hasura; migrations + metadata auto-applied
make seed        # sample users, products, an order
make smoke       # asserts the API returns seeded data with relationships
# Console: http://localhost:8080/console  (admin secret from .env)
make down        # stop   ·   make reset wipes the volume
```

### Production (intended — not yet implemented)
Build images in CI → push to GHCR → deploy via Helm to GKE (provisioned by Terraform),
with Keycloak, Hasura, the workflow service, and the observability stack in-cluster,
secrets via Kubernetes `Secret`s. See spec §5.

## 12. Recommended next steps & roadmap

**Immediate next (M5 — Observability + CI + Kubernetes):**
1. Structured logging (pino → Loki) with correlation ids across Hasura → service.
2. Prometheus metrics (RED + domain: orders by state, transition counts) and
   OpenTelemetry traces (dashboard → Hasura → Action → service → Postgres) → Tempo;
   one provisioned Grafana with a committed dashboard JSON.
3. GitHub Actions CI: lint + typecheck + unit/integration (Testcontainers) → build
   images (incl. the dashboard) → push GHCR → E2E against the composed stack;
   Hasura migrations/metadata applied in CI.
4. Helm chart + kind deploy (probes, resource limits, NetworkPolicy, HPA).
5. ADRs in docs/adr/ + README architecture GIF.

**Then:** Phase 2 (Terraform → GKE, production-shaped) → Phase 3 (optional depth).

**Process note for contributors (human or AI):** this project follows a
spec → plan → execute flow. Each milestone gets a plan in `docs/superpowers/plans/`
before implementation, TDD where practical, and small commits. Verify with the smoke
test / test suites before claiming completion.

---

## Changelog
- **2026-07-22 (fix)** — Dashboard now refreshes the Keycloak access token via the
  refresh token in the next-auth jwt callback; when the refresh token is also expired it
  forces a clean re-login. Fixes a stale-session state where an expired access token was
  sent to Hasura ("Could not verify JWT: JWTExpired") while the app still looked logged in.
- **2026-07-20 (M5c)** — Helm chart (infra/helm/orderflow) for all services with dev
  defaults + values-prod.yaml hardening overlay (DEV_MODE off, console off, CORS locked,
  external DB, secrets from an existing Secret); custom Hasura image bakes migrations+
  metadata for in-cluster apply; HPA + NetworkPolicy + probes/resources. helm lint clean,
  both overlays render, core path (Postgres+Hasura+workflow-service) verified live on kind.
  **Phase 1 complete.**
- **2026-07-20 (M5d)** — Architecture Decision Records added under docs/adr/ (6 ADRs
  covering the Hasura+service split, sync/async, NestJS, Keycloak, sole-writer+audit,
  and observability); README gained an architecture section + ADR pointer.
- **2026-07-20 (M5b)** — CI on GitHub Actions: ci.yaml (lint/typecheck/unit +
  Testcontainers integration) green on PRs and main; images.yaml builds & pushes the
  workflow-service image to GHCR; e2e.yaml (manual) runs full-stack Playwright.
  CI badge added. Verified green on GitHub.
- **2026-07-20 (M5a)** — Observability: workflow service exposes Prometheus /metrics
  (RED + domain counters), emits OpenTelemetry traces (auto HTTP/pg + manual
  order.transition span) to Tempo, and logs structured pino JSON with trace_id.
  `make obs-up` runs Prometheus + Tempo + Grafana with a provisioned dashboard.
  Verified end-to-end (metrics scraped, dashboard live, traces in Tempo).
- **2026-07-20** — M4 completed: Keycloak realm (fixed user ids = seeded users.id),
  Hasura JWT claims_map + per-role select permissions on all tables,
  `packages/graphql-client` (codegen), Next.js dashboard with role-derived action
  buttons and federated logout, Playwright E2E (lifecycle + RBAC isolation).
- **2026-07-18** — M3 (Order Workflow Service) completed: NestJS actions + async event
  trigger, transactional transitions with audit + atomic stock reservation, idempotency,
  Testcontainers integration tests; verified end-to-end in the running stack. Fixed a
  PG_POOL ESM import cycle found only by running the container. Project renamed to
  **Ecommerce OrderFlow** (folder, npm scope, Docker project, Postgres identifiers).
- **2026-07-17** — M1 (foundation + domain state machine) and M2 (data layer) completed;
  `isTerminal` bug fixed (derived from transition table); this context doc created.
