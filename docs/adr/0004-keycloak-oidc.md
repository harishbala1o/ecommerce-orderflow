# 4. Keycloak (self-hosted OIDC) for authentication + role claims

Date: 2026-07-20 · Status: Accepted

## Context

The system needs real authentication and three roles (customer/ops/admin) whose identity
must flow into Hasura's authorization. Hasura authorizes from **JWT claims** validated
against a JWKS endpoint.

## Decision

Run **Keycloak** as the OIDC identity provider. It issues JWTs whose claims map to Hasura
session variables (`x-hasura-allowed-roles` from realm roles, `x-hasura-default-role`
from a user attribute, `x-hasura-user-id` from `sub`). Keycloak user ids are fixed equal
to the seeded `users.id`, so `sub` joins directly against `orders.customer_id` with no
user-sync service. The Next.js app authenticates via next-auth's Keycloak provider (PKCE).

## Consequences

- Standards-based auth (OIDC/JWKS); Hasura verifies signatures — the app never trusts a
  hand-parsed token for a security decision (the web role is a UI hint only).
- Demonstrates running and integrating a real IAM, a strong signal vs. a toy JWT.
- Keycloak is a heavier dependency to operate; acceptable for the learning/portfolio goal.

## Alternatives considered

- **Self-issued JWTs**: less to run, but reinvents an IdP and its security surface.
- **Managed (Auth0/Clerk)**: fastest, but less to demonstrate and an external dependency.
