# 5. The service is the sole writer of order state, with an append-only audit log

Date: 2026-07-20 · Status: Accepted

## Context

Order status is the system's core invariant: it may only change through **valid,
authorized** transitions, and every change must be attributable. If clients (or raw
Hasura mutations) could set `orders.status` directly, the state machine would be
advisory, not enforced.

## Decision

The workflow service is the **only** writer of `orders.status`. Hasura exposes **no**
insert/update/delete permission on orders to any role; status changes happen exclusively
via the `transitionOrder` Action. Each accepted transition, inside a single transaction:
validates against the domain state machine (legal transition + role + ownership),
updates the status, and appends a row to an **append-only `order_events`** table
(from/to/action/actor/role). Stock is reserved in the same transaction on confirmation.

## Consequences

- The state machine is truly enforced, not merely reflected in the UI.
- Every order has a complete, tamper-evident history for free (audit, debugging, support).
- All writes funnel through one service — a deliberate bottleneck that keeps the invariant
  in one place; horizontal scaling is via more service instances, not more writers.

## Alternatives considered

- **Client/Hasura writes with a CHECK constraint or trigger**: DB triggers can guard
  legal transitions but not role/ownership context cleanly, and scatter logic into SQL.
- **Event sourcing** (rebuild state from events): more power and a steeper cost; the
  append-only log here gives most of the audit benefit without the rebuild machinery.
