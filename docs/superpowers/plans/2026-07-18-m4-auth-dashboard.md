# M4 — Auth (Keycloak) + RBAC + Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace dev role-headers with real authentication: Keycloak issues JWTs whose
claims drive Hasura's per-role row/column permissions, and a Next.js dashboard lets the
three personas log in, browse orders they're allowed to see, and drive the order lifecycle.
Playwright proves the whole flow end-to-end.

**Architecture:** Keycloak (OIDC, realm imported from a committed JSON) issues access
tokens. Hasura validates them via JWKS (`claims_map`: allowed-roles ← realm roles,
default-role ← a `hasura_default_role` user-attribute claim, user-id ← `sub`). Keycloak
user ids are **fixed to equal our seeded `users.id`**, so `x-hasura-user-id` joins directly
against `orders.customer_id`. The dashboard (Next.js app router + next-auth Keycloak
provider) attaches the bearer token to a typed urql client; role-aware action buttons are
computed by reusing `@ecommerce-orderflow/domain` in the browser.

**Tech Stack:** Keycloak 25, next-auth v4, Next.js 14, urql + graphql-codegen
(TypedDocumentNode), Tailwind CSS, Playwright.

## Global Constraints
- Commits authored solely by the owner; no AI mentions. TS strict everywhere.
- UI: simple/modern/professional — no gradients, no glassmorphism, no badge-spam; one
  restrained accent color on a neutral scale.
- All Hasura permission changes via versioned metadata files.
- Realm JSON is committed (dev credentials are placeholders, documented as dev-only).

## Tasks

### Task 1: Keycloak in compose + realm import
- `infra/keycloak/realm-ecommerce-orderflow.json`: realm with roles `customer|ops|admin`;
  users Ada Admin / Otto Ops / Cara Customer with **ids = seeded users.id**, attribute
  `hasura_default_role`, password `demo1234` (dev-only); public client `web`
  (PKCE, redirect `http://localhost:3000/*`, direct-access grants ON for tests/curl);
  protocol mapper: user attribute `hasura_default_role` → token claim.
- compose: `keycloak` service (quay.io/keycloak/keycloak:25.0, `start-dev --import-realm`,
  port **8081**:8080, health via /realms endpoint); Hasura gets
  `HASURA_GRAPHQL_JWT_SECRET` (jwk_url → `http://keycloak:8080/...`, claims_map) and
  `depends_on` keycloak.
- Seed: set `keycloak_id` = fixed ids on the three users.
- Verify: password-grant token for Otto → GraphQL query as ops succeeds without admin secret.

### Task 2: Hasura RBAC permissions (metadata)
- `products`: select for all three roles (catalog columns).
- `orders`: customer select where `customer_id = X-Hasura-User-Id`; ops/admin select all.
- `order_items`: customer select via `order.customer_id`; ops/admin all.
- `order_events`: customer select via `order.customer_id`; ops/admin all.
- `users`: customer select own row (id = X-Hasura-User-Id, safe columns); ops/admin select all.
- No insert/update/delete permissions anywhere — mutations only via Actions.
- Verify with real JWTs: Cara sees only her orders; Otto sees all; no admin secret involved.

### Task 3: `packages/graphql-client` — typed operations
- graphql-codegen (`client` preset) introspecting local Hasura (admin secret, dev-time only);
  operations: `OrdersList`, `OrderDetail`, `ProductsList`, `PlaceOrder`, `TransitionOrder`.
- Exports typed documents + a `makeClient(url, getToken)` urql factory.
- Generated output committed (build doesn't require a live Hasura).

### Task 4: `apps/web` — the dashboard
- Next.js 14 (app router) + Tailwind; next-auth v4 Keycloak provider (JWT session strategy,
  access token exposed to the urql provider); sign-in page; middleware-protected routes.
- Pages: `/` orders list (status chip, total, customer, updated; role decides breadth),
  `/orders/[id]` detail (line items, event timeline, **action buttons derived from
  `TRANSITIONS` in @ecommerce-orderflow/domain** for the session role), `/new` place-order
  (product picker + quantities; customer/admin only).
- Structured error surfaces (e.g. `insufficient-stock` shown as a friendly inline message).
- Verify manually against the running stack with all three personas.

### Task 5: Playwright E2E
- `apps/web/e2e/lifecycle.spec.ts`: Cara logs in (real Keycloak form) → places an order →
  sees it PENDING; Otto logs in → confirms/packs/ships/delivers it; Cara sees DELIVERED and
  the timeline. A forbidden case: Cara gets no action buttons on another customer's order
  (she can't even open it — 404 by RBAC).
- `playwright.config.ts` boots `next dev` via webServer; stack assumed up (`make up`).

### Task 6: Docs + wrap-up
- README: personas/passwords table, dashboard quick-start (`pnpm dev`), port map.
- PROJECT_CONTEXT: M4 status, auth architecture, JWT claims flow.
- Full gate: `pnpm lint && pnpm typecheck && pnpm test`, `make smoke`, E2E green.

**Deliberate scope cuts (documented):** dashboard not containerized until M5 (CI needs it;
local dev uses `pnpm dev`); no token-refresh flow (60-min dev token lifespan); realtime
subscriptions deferred (polling/refetch after mutations).

## Self-Review
- Spec §2.1 roles enforced at two layers (Hasura row-level + service-side gates already in M3). ✅
- `sub == users.id` removes a users-sync service — assumption documented in realm JSON + context doc. ✅
- E2E covers the demo path a recruiter would watch. ✅
