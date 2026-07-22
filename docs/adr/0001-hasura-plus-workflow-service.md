# 1. Hasura for data access + a dedicated service for invariants

Date: 2026-07-20 · Status: Accepted

## Context

The system needs a GraphQL API over a relational schema (reads, filters, relationships,
realtime) *and* a place to enforce business rules (the order lifecycle, stock, ownership).
Putting everything in one hand-written API means reinventing a lot of CRUD; putting
everything in a low-code/auto-generated layer leaves nowhere clean to enforce invariants.

## Decision

Use **Hasura** for data access — generated GraphQL over Postgres with declarative
row/column permissions and subscriptions — and a **dedicated workflow service** for
business operations. Reads and trivial writes go through Hasura; anything that must
uphold an invariant (state transitions) goes through the service, wired in via Hasura
Actions and Event Triggers.

## Consequences

- No custom code for the 80% that is CRUD; permissions are declarative and versioned.
- A single, testable place owns the domain rules; the client can't bypass them.
- Two moving parts to run and deploy instead of one, and a boundary to keep clean
  (see [0002](0002-sync-actions-async-events.md), [0005](0005-sole-writer-audit.md)).

## Alternatives considered

- **Hasura only** (permissions + SQL functions): business logic smeared across SQL and
  metadata; hard to test the state machine in isolation.
- **Hand-written GraphQL server only**: full control, but months of CRUD/permission
  plumbing for little differentiation.
