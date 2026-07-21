# Security

This document describes the security model of Ecommerce OrderFlow: the trust
boundaries, what the design deliberately protects against, and the difference
between the local-dev defaults and a production deployment.

> Scope: this is a portfolio project. The local `docker compose` stack ships
> **dev-only defaults** so it runs on a clean clone. The "Production hardening"
> section lists what changes for a real deployment.

## Architecture & trust boundaries

```
Browser ──(1) OIDC──► Keycloak
   │
   │ (2) GraphQL + JWT (Bearer)
   ▼
 Hasura ──(3) Action/Event + shared secret──► Workflow service ──► Postgres
   │
   └──(4) SQL (row/column permissions)──► Postgres
```

1. **Browser ↔ Keycloak** — authentication happens at Keycloak (OIDC, PKCE).
   The dashboard never sees a password; it receives a signed JWT.
2. **Browser ↔ Hasura** — every request carries the Keycloak-issued JWT.
   Hasura validates the signature against Keycloak's JWKS and derives the role
   and user id from the token's claims (`claims_map`). The browser cannot
   choose its own role — allowed roles come from the verified token.
3. **Hasura ↔ Workflow service** — the service is **not** a public API. It is
   reachable only from Hasura, authenticated by a shared `x-action-secret`
   header that Hasura injects server-side (never exposed to the browser, and
   client headers are not forwarded). The service re-derives the actor from
   Hasura's forwarded session variables — never from client-supplied fields.
4. **Hasura/service ↔ Postgres** — all access is over the internal network.

## What the design protects against

- **SQL injection** — the workflow service uses only parameterized queries;
  Hasura generates parameterized SQL. No string-built SQL anywhere.
- **Broken authorization** — enforced at two independent layers:
  - Hasura **row/column permissions** scope every read to the caller
    (a customer can only ever see their own orders/items/events).
  - The workflow service **re-validates** every state transition against the
    domain state machine (legal transition + role permission + ownership)
    before writing. The UI deriving buttons from the same table is a
    convenience, not the control.
- **Illegal state changes** — order status can only change through the service,
  which is the sole writer of `orders.status`. Clients cannot issue a raw
  status update. Every transition is written to an append-only `order_events`
  audit table inside the same transaction.
- **Token forgery / privilege escalation** — roles are taken from the
  cryptographically verified JWT (Hasura via JWKS; the web app reads the role
  from next-auth's validated OIDC profile, and treats it only as a UI hint).
- **Idempotency abuse** — event-trigger side effects are deduplicated on the
  Hasura delivery id, so at-least-once retries never double-apply.
- **Resource exhaustion (basic)** — order input is bounded (max items/qty), the
  DB pool is capped with connection/statement timeouts, and request bodies are
  bounded by the framework default.
- **Secret exposure in git** — only `*.env.example` files (dev placeholders)
  are committed; real `.env` / `.env.local` are gitignored. Build output and
  caches are gitignored.

## Local-dev posture (intentional)

The committed defaults prioritize "clone and `make up`". They are **not secret**:

- `.env.example` contains dev-only credentials (self-labeled `_dev_`).
- Hasura runs with `DEV_MODE=true`, the console enabled, and permissive CORS.
- Everything is HTTP on `localhost`; services are published to host ports.
- Seed data uses fixed UUIDs (so Keycloak `sub` maps to `users.id` and tests
  are deterministic).

## Production hardening (before a real deployment)

Generate fresh secrets and never reuse the dev defaults:

```bash
make gen-secrets   # prints cryptographically-random secrets for .env
```

Then, via the production overlay (tracked under M5 / Phase 2):

- **TLS everywhere** — terminate HTTPS at the ingress; no plaintext between the
  browser and the edge.
- **Hasura:** `HASURA_GRAPHQL_DEV_MODE=false`, console disabled,
  `HASURA_GRAPHQL_ADMIN_INTERNAL_ERRORS=false`, CORS locked to the dashboard
  origin, admin secret from a secrets manager.
- **Secrets** from Kubernetes `Secret`s / a secrets manager, not `.env` files;
  documented rotation.
- **Least privilege** — separate Postgres roles for Hasura and the service
  (not the owner role); the workflow service exposed only as an internal
  (ClusterIP) service.
- **Edge controls** — rate limiting and WAF at the ingress; dependency
  scanning (Dependabot / `pnpm audit`) and image scanning in CI.
- **Non-root containers** (already applied to the workflow service).

## Reporting

This is a personal project without a formal disclosure process. If you find a
security issue, please open an issue describing it (omit any working exploit
details in public).
