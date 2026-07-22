# 3. NestJS (TypeScript) for the workflow service

Date: 2026-07-20 · Status: Accepted

## Context

The workflow service needs clear structure (controllers, DI, guards, interceptors),
first-class TypeScript, and good observability support. The rest of the stack is already
TypeScript.

## Decision

Build the service with **NestJS**. Use its module/DI system to keep boundaries explicit
(config, db, orders, events, observability), guards for the shared-secret check, and an
interceptor for RED metrics. Keep the pure domain logic in a framework-agnostic
`@ecommerce-orderflow/domain` package so it stays trivially unit-testable.

## Consequences

- One language across the whole repo; the domain package is shared by the service and the
  web app (which derives its action buttons from the same transition table).
- NestJS structure reads as intentional architecture and is familiar to reviewers.
- Some framework ceremony vs. a bare HTTP handler; justified by the guard/interceptor/DI
  wiring the project actually uses.

## Alternatives considered

- **Fastify/Express bare**: less ceremony, but hand-rolled DI, validation, and lifecycle.
- **Go**: great for a small high-perf service and DevOps signal, but a second language and
  no code sharing with the domain package or the frontend.
