# OrderFlow — Project Context & Onboarding Guide

> **Single source of truth** for anyone — human or AI — picking up this project.
> Read this first, then the design spec in [`docs/superpowers/specs/`](docs/superpowers/specs/).
>
> **Last updated:** 2026-07-17 · **Current milestone:** M2 complete, M3 next.
>
> **How to maintain this doc:** update the *Status* table and *Changelog* whenever a
> milestone lands or a significant decision changes. Keep sections concise — link to
> the spec/plans for detail rather than duplicating them.

---

## 1. Project overview & objectives

**OrderFlow** is an e-commerce **order management** platform (the operations side, not a
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
management dashboard with Hasura and GraphQL" blog, but OrderFlow is built from scratch
with modern tooling rather than a low-code tool — the point is to *show the engineering*.

The core domain problem is **workflow correctness**: order state must only change through
**valid, authorized transitions**, and every change must be recorded. That invariant is
the heart of the project.

## 3. Current architecture & key design decisions

```
                         ┌──────────────────────────┐
   Browser ── Next.js ───┤  Keycloak (OIDC) → JWT    │  role claims in JWT
   dashboard (M4)         └──────────────────────────┘
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
`docs/adr/` (planned, M5).

## 4. Tech stack & rationale

| Layer | Choice | Why |
|---|---|---|
| Data store | **PostgreSQL 16** | Relational integrity for orders/items/events; native enum for status |
| GraphQL API | **Hasura graphql-engine v2.42** | Auto-generated CRUD + subscriptions + declarative RBAC; versioned metadata/migrations |
| Workflow service | **NestJS (TypeScript)** | Structured modules/DI → a real "clean architecture" story; unifies language with frontend |
| Auth/IdP | **Keycloak** (planned M4) | Self-hosted OIDC; real IAM; JWT role claims into Hasura; strong DevOps signal |
| Frontend | **Next.js + React + TS** (planned M4) | Industry default for dashboards; pairs with typed GraphQL client |
| GraphQL client | **graphql-codegen + urql** (planned M4) | Typed operations; lighter than Apollo |
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
| M3 | Workflow service | NestJS service, Hasura Actions (sync transitions), Event Triggers (async side effects), idempotency, Testcontainers integration tests | ⏳ **Next** |
| M4 | Auth + dashboard | Keycloak, JWT→Hasura claims, per-role RBAC permissions, Next.js dashboard, typed GraphQL client, Playwright E2E | ☐ Planned |
| M5 | Observability + CI + k8s | Logging/metrics/tracing/Grafana, GitHub Actions CI, Helm + kind deploy, README + ADRs | ☐ Planned |
| P2 | Production-shaped | Terraform → GKE, HPA, NetworkPolicy, alerting, CD | ☐ Future |
| P3 | Depth flourishes | Inventory service, SLOs, k6 load tests, canary rollout | ☐ Future (optional) |

**What works today:** the domain logic (unit-tested) and the data layer — a live GraphQL
API over the schema, with relationships and realtime subscriptions, browsable via the
Hasura console. **Not yet built:** order-transition mutations, per-role permissions, auth,
and any UI. Everything currently runs under the Hasura admin secret.

## 6. Repository structure

```
orderflow/
├── package.json, pnpm-workspace.yaml, turbo.json   # monorepo tooling
├── tsconfig.base.json, eslint.config.mjs           # shared TS/lint config
├── Makefile                                         # up / down / seed / smoke / reset
├── .env.example                                     # env template (copy to .env)
├── README.md                                        # quick-start
├── PROJECT_CONTEXT.md                               # ← this file
├── packages/
│   ├── domain/          # ★ order state machine (pure, framework-agnostic, 18 tests)
│   │   └── src/ order-status.ts · roles.ts · transitions.ts · errors.ts · state-machine.ts · index.ts (+ *.test.ts)
│   └── config/          # zod-validated env loader
├── hasura/
│   ├── config.yaml
│   ├── migrations/default/1720000000000_init/       # schema (up.sql / down.sql)
│   ├── metadata/                                     # tracked tables + relationships (versioned)
│   └── seeds/default/1720000000001_seed/up.sql      # sample data
├── infra/
│   └── docker/ compose.yaml · smoke-test.sh
└── docs/
    └── superpowers/
        ├── specs/2026-07-17-orderflow-design.md      # the approved design
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
- Reads, filters, aggregates, and subscriptions all work today (admin only).

### Integrations (planned)
- **Hasura Actions → NestJS** (sync transitions), **Event Triggers → NestJS** (async side
  effects), **Keycloak JWKS → Hasura** (JWT validation), **Keycloak claims → Hasura RBAC**.

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
- No order-transition mutations yet — the state machine is not wired to the DB (M3).
- No authentication or per-role permissions — everything runs under the admin secret (M4).
- No UI (M4). No observability, CI, or deployment yet (M5+).

**Known quirks:**
- First `make up` logs transient `Inconsistent Metadata!` warnings (the `cli-migrations-v3`
  image applies metadata before migrations on its bootstrap server). The normal-mode
  server reconciles once tables exist (`is_consistent: true`); restarts boot clean. Not an
  error — documented in the README.

**Tech debt / to revisit:**
- Package entry points reference `./src/*.ts` (fine for the TS monorepo now; revisit build
  outputs when the NestJS service consumes `@orderflow/domain` in M3).
- Seed uses fixed UUIDs for repeatable smoke tests — fine for dev; not for prod.

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
cd orderflow
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

**Immediate next (M3 — Workflow Service):**
1. Scaffold `apps/workflow-service` (NestJS) consuming `@orderflow/domain`.
2. Implement transition endpoints and wire them as **Hasura Actions** (sync).
3. Implement **Event Trigger** handlers (audit write, stock decrement, notification stub)
   with idempotency keyed on the Hasura event id; transition + audit write in one DB tx.
4. zod validation at Action/Event boundaries; typed → structured Action errors.
5. Testcontainers integration tests against real Postgres.

**Then:** M4 (auth + RBAC + dashboard + E2E) → M5 (observability + CI + kind/Helm + ADRs)
→ Phase 2 (Terraform/GKE, production-shaped) → Phase 3 (optional depth).

**Process note for contributors (human or AI):** this project follows a
spec → plan → execute flow. Each milestone gets a plan in `docs/superpowers/plans/`
before implementation, TDD where practical, and small commits. Verify with the smoke
test / test suites before claiming completion.

---

## Changelog
- **2026-07-17** — M1 (foundation + domain state machine) and M2 (data layer) completed;
  `isTerminal` bug fixed (derived from transition table); this context doc created.
