# Ecommerce OrderFlow — Design Spec

> Status: **Approved for planning** · Date: 2026-07-17
> A flagship portfolio project: an e-commerce **order management** dashboard,
> inspired by Appsmith's Hasura order-management blog but built from scratch with
> modern tooling and deliberate engineering decisions.

---

## 1. Goals & non-goals

**Goals**
- A production-*shaped*, genuinely runnable system that reads as *thoughtfully
  engineered* — decisions, not output.
- Credibly demonstrate, across phases, skills in: backend/API design, data
  modeling, auth/RBAC, workflow correctness, observability, containerization,
  CI/CD, Kubernetes, and Infrastructure as Code.
- Be demoable in minutes (`make up`) and discussable in depth in an interview.

**Non-goals**
- Not a customer-facing storefront — this is the **operations** side (where the
  interesting workflow lives).
- Not a feature-maximalist app. Breadth is achieved through *phasing*, not by
  shipping shallow versions of everything at once.
- Not a payments/real-money system. Payment is modeled as a state, not integrated.

**Anti-goal (explicit):** avoid anything that reads as AI-generated or "vibe
coded" — no unexplained boilerplate, no untested core logic, no click-configured
infra that can't be reproduced from the repo.

---

## 2. Domain model

### 2.1 Roles (RBAC)

| Role | Can do | Cannot do |
|------|--------|-----------|
| **customer** | Place orders; view **only their own** orders; cancel while `PENDING` | See others' orders, analytics, or audit log |
| **ops** | Advance orders through fulfillment (`CONFIRMED`→`SHIPPED`); view all orders | Delete orders; force-cancel shipped orders; see admin analytics |
| **admin** | Full visibility; override/force-cancel; view analytics + audit log | — |

Enforcement is layered: **Hasura row/column permissions** (from JWT claims) for
data access, and the **workflow service** for operation-level authorization on
state transitions.

### 2.2 Core entities

- `users` — mirrored from Keycloak (subject id, role); source of truth for identity is Keycloak.
- `orders` — id, customer_id, status, totals, timestamps.
- `order_items` — line items (product, qty, unit price).
- `products` — catalog + `stock_qty`.
- `order_events` — **append-only** audit log: (order_id, from_status, to_status, actor, reason, correlation_id, created_at).

### 2.3 The order state machine (the heart of the project)

```
                ┌─── cancel (admin) ───────┐
                ▼                           │
  PENDING ──▶ CONFIRMED ──▶ PACKED ──▶ SHIPPED ──▶ DELIVERED
     │            │                                    │
     └── cancel ──┘                              return │
       (customer/admin)                                 ▼
                                                     RETURNED
```

Rules:
- Transitions are **owned exclusively by the workflow service**. Clients never
  issue a raw `update_orders(status:)`.
- Every transition is **guarded**: legal-transition check → role check →
  precondition check (e.g. stock available to `CONFIRM`, not already terminal).
- Illegal transitions raise typed errors (`IllegalTransitionError`) surfaced as
  structured GraphQL/Action errors — never stack traces.
- Every accepted transition writes an `order_events` row (audit) and emits a
  domain event for async side effects.
- Terminal states (no outgoing transition): `CANCELLED`, `RETURNED`. `DELIVERED`
  is a *completed but reversible* state — a `return` can still be initiated from
  it — so it is deliberately **not** terminal. `isTerminal` is derived from the
  transition table so the two can never drift.

The state machine lives in a framework-agnostic `packages/domain` module so it is
trivially unit-testable in isolation.

---

## 3. System architecture

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
          │ SQL                                   │  • event handlers    │
          ▼                                       └──────────┬───────────┘
   ┌─────────────┐                                           │ writes
   │  Postgres   │ ◀─────────────────────────────────────────┘
   └─────────────┘
```

### 3.1 Two deliberate paths

- **Reads & simple writes** → straight through Hasura's generated GraphQL, gated
  by row/column permissions derived from JWT claims. No custom code — that is the
  point of using Hasura.
- **Business operations** (`confirmOrder`, `packOrder`, `shipOrder`,
  `deliverOrder`, `cancelOrder`, `returnOrder`) → **Hasura Actions** that call the
  NestJS service. The service is the **only** writer of order state.
- **Side effects** (email/notification stub, decrement inventory, write audit
  event, emit metrics) → **Hasura Event Triggers** → NestJS handlers, run
  **asynchronously** so mutations stay fast and side effects are retryable.

### 3.2 Sync vs async — the rule

> Use a synchronous Action when the caller needs the result of the operation
> (the new order state). Use an async Event Trigger when the work can happen
> after the response and must survive retries (at-least-once).

### 3.3 Idempotency & consistency

- Event Trigger handlers are **idempotent**, keyed on Hasura's delivery/event id,
  so at-least-once retries never double-apply side effects.
- The state transition + audit-event write happen in a **single DB transaction**
  in the workflow service.

---

## 4. Cross-cutting concerns

### 4.1 Observability (one coherent stack)

- **Logging** — `pino` structured JSON logs carrying a `correlationId`
  propagated from the dashboard → Hasura → Action/Event → service. Shipped to **Loki**.
- **Metrics** — **Prometheus**. RED metrics (rate/errors/duration) *and* domain
  metrics: orders by state, transition counts, time-in-state, cancellation rate.
- **Tracing** — **OpenTelemetry** (auto + manual spans). Target artifact: a
  single trace spanning `dashboard → Hasura → Action → NestJS → Postgres`,
  exported to **Tempo**.
- **One Grafana** as the single pane (Loki + Prometheus + Tempo datasources), with
  a **committed, provisioned dashboard JSON** — reproducible, not click-built.

### 4.2 Testing

- **Unit** — exhaustive state-machine tests: every legal transition, every illegal
  transition rejected, every role gate. This is the suite to open in an interview.
- **Integration** — workflow service against a real Postgres via **Testcontainers**.
- **E2E** — **Playwright** drives the dashboard through a full order lifecycle
  against the Docker Compose stack.
- **Contract** — Action/Event payloads validated with **zod** at the boundary; a
  schema-drift test fails CI if Hasura metadata and service types diverge.

### 4.3 Error handling & validation

- Typed domain errors (`IllegalTransitionError`, `InsufficientStockError`, …)
  mapped to structured Action error responses. No stack traces to clients.
- **zod** validation at every external boundary (Action input, Event payload,
  env/config via a validated config module that fails fast on boot).

### 4.4 Security

- Keycloak issues JWTs with a Hasura-namespaced claims block
  (`x-hasura-role`, `x-hasura-user-id`, allowed roles).
- Hasura validates JWTs against Keycloak's JWKS.
- The workflow service is **not** publicly exposed; it trusts only requests from
  Hasura (shared Action secret header) and re-derives the actor from the
  forwarded session, never from client-supplied fields.
- Secrets via env in dev, `Secret` refs in K8s. Nothing sensitive committed.

---

## 5. Infrastructure & delivery

- **Local dev** — one `docker compose up` brings up Postgres, Hasura, Keycloak,
  the workflow service, the dashboard, and the observability stack. A `Makefile`
  (`make up`, `make down`, `make seed`, `make test`, `make logs`) is the friendly
  front door.
- **CI (GitHub Actions)** — lint + typecheck → unit + integration (Testcontainers)
  → build multi-stage images → push to **GHCR** → E2E against the composed stack.
  Hasura **metadata & migrations applied in CI** (versioned, reviewable — never
  hand-applied in the console).
- **Kubernetes** — a **Helm chart** with `dev`/`prod` values overlays; liveness/
  readiness probes, resource requests/limits, HPA on the workflow service,
  `NetworkPolicy`, secrets via `Secret` refs. Deployable to a local **kind**
  cluster, documented so any reviewer can run it.
- **IaC (Terraform)** — provisions **GKE** (Autopilot) + managed Postgres + DNS.
  `terraform plan` runs in CI on PRs. Deliberately **not** left running 24/7;
  the README documents a spin-up/tear-down flow and is honest about it (honesty
  reads better than pretending it's always live).

---

## 6. Phasing

**Phase 1 — "It works, end to end, and it's clean" (flagship deliverable)**
Keycloak auth (3 roles) → dashboard login → place order (customer) → advance
through the full state machine via Actions with async side effects via Events →
Hasura RBAC enforced → structured logs + traces + domain-metric Grafana dashboard
→ `docker compose up` runs everything → GitHub Actions CI (lint, typecheck, unit +
integration + E2E) → deployable to local **kind** via Helm. Exhaustive
state-machine tests. **Fully finished vertical slice — demoable and coherent.**

**Phase 2 — "It's production-shaped"**
Terraform → GKE live deploy; HPA + NetworkPolicy + probes tuned; Tempo/Loki/
Prometheus in-cluster; alerting rules; CD (deploy on tag); secrets management.

**Phase 3 — "Depth flourishes" (choose per target roles; not committed)**
Candidates: a second bounded context (inventory service) to show multi-service
design; SLO/error-budget dashboards; k6 load testing with results in the README;
blue-green/canary rollout; a transactional-outbox writeup.

---

## 7. Repository structure

Monorepo (pnpm workspaces + Turborepo):

```
ecommerce-orderflow/
├── apps/
│   ├── web/                 # Next.js dashboard
│   └── workflow-service/    # NestJS: state machine, Actions, Event handlers
├── packages/
│   ├── domain/              # state machine + types, framework-agnostic, heavily tested
│   ├── graphql-client/      # generated typed GraphQL SDK
│   └── config/              # shared zod-validated config, tsconfig, eslint
├── hasura/                  # metadata/, migrations/, seeds/  (versioned, applied in CI)
├── infra/
│   ├── docker/              # Dockerfiles, compose.yaml
│   ├── helm/                # chart + dev/prod values
│   └── terraform/           # GKE, Postgres, DNS modules
├── observability/           # grafana dashboards, prometheus rules, otel-collector config
├── .github/workflows/       # ci.yaml, cd.yaml, terraform-plan.yaml
├── docs/
│   ├── architecture.md      # diagrams + the "why"
│   ├── adr/                 # Architecture Decision Records
│   └── runbook.md           # how to operate it
├── Makefile
└── README.md
```

**Documentation that makes reviewers stop:**
- README with the architecture diagram, a 60-second "what & why", and a GIF of a
  live trace + the order flow.
- **ADRs** in `docs/adr/` — short records of *why* (Hasura+service split, sync vs
  async, NestJS, Keycloak). Highest-signal, lowest-cost anti-vibe-coded artifact.
- Per-component justification table (below), mirrored in the README.

---

## 8. Per-component justification

| Component | Why it exists | Skills demonstrated | Portfolio value |
|---|---|---|---|
| **Order Workflow Service (NestJS)** | Owns invariants; the one writer of order state | Backend design, DDD, state machines, testing | The core "can actually engineer" proof |
| **Hasura + Postgres** | Data access, realtime subscriptions, RBAC without boilerplate | Data modeling, GraphQL, auth policy, knowing when *not* to write code | Shows judgment, not just coding |
| **Keycloak** | OIDC identity, role claims into JWT | IAM, OIDC/JWT, running real infra | Enterprise-grade auth, not a toy |
| **Observability stack** | See system behavior across services | OpenTelemetry, Prometheus, Grafana, SRE thinking | Rare in portfolios; senior signal |
| **Docker Compose + Make** | One-command reproducible local env | Containerization, DX | Reviewers can run it in ~2 min |
| **GitHub Actions CI/CD** | Automated quality gates + delivery | CI/CD, testing discipline | Proof of process maturity |
| **Helm + kind / GKE** | Real deployment target | Kubernetes, Helm, cloud | DevOps/cloud depth |
| **Terraform** | Reproducible infra | IaC, cloud provisioning | Completes the platform story |

---

## 9. What makes it stand out

- **Correctness** — a rigorously tested state machine, not CRUD glued to a UI.
- **Judgment** — the deliberate Hasura-boundary story (data vs invariants) and the
  sync-vs-async split, defensible in interviews.
- **A real distributed trace** across four hops — most portfolios have no tracing.
- **Honest cost engineering** — Terraform spin-up/down, documented plainly.
- **ADRs** — proof of intent. The project reads as decisions, not output.

---

## 10. Locked decisions (ADR seeds)

1. Hasura for data access + realtime + RBAC; a dedicated NestJS service for
   invariants/workflows. *(Why: right tool per concern; avoids reinventing CRUD.)*
2. Sync Actions when the caller needs the result; async Event Triggers for
   retryable side effects.
3. NestJS (TypeScript) for the workflow service; TypeScript end-to-end.
4. Keycloak for OIDC/JWT + role claims (self-hosted, real IAM).
5. Next.js/React/TS for the dashboard.
6. Monorepo: pnpm workspaces + Turborepo.
7. GKE (Autopilot) as the Terraform target; not always-on, for cost.
8. Phase 1 = fully finished vertical slice before breadth.

---

## 11. Open questions (to resolve during planning)

- Exact Postgres schema (columns, indexes, constraints) — settle in the plan.
- Whether `products`/inventory is a table in Phase 1 or stubbed until Phase 3's
  inventory service.
- Node GraphQL client choice for `packages/graphql-client` (e.g. graphql-codegen
  + urql/Apollo) — settle in the plan.
