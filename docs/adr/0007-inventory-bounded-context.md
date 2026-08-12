# 7. Inventory as a separate bounded context with its own database

Date: 2026-08-12 · Status: Accepted · Amends [0005](0005-sole-writer-audit.md)

## Context

Stock started as a single `products.stock_qty` column decremented inside the same
transaction as an order status change. That was correct and simple, but it could not express
the distinction real fulfilment depends on: stock that is **physically present** versus stock
that is **already promised to someone else**. Without that distinction, an order can only be
checked against stock at confirmation time, so two customers can both be accepted for the
last unit and one is disappointed later.

We also wanted a genuine second service rather than a second module, to model how bounded
contexts communicate.

## Decision

Inventory becomes its own service with its **own database**, owning:

- `stock_items` with `on_hand` and `reserved`, where `available` is always derived as
  `on_hand - reserved` and never stored.
- `reservations`, unique on `(order_id, product_id)`, which gives idempotency for free.
- `stock_movements`, append only, mirroring the audit philosophy of `order_events`.
- `stock_alerts`, with a partial unique index enforcing at most one open alert per product.

`products.stock_qty` is **removed**. Two sources of truth for stock is the exact bug this
service exists to prevent.

A separate database in the same PostgreSQL instance was chosen over a separate schema
because **PostgreSQL cannot join or transact across databases**. The boundary is therefore
enforced by the engine, not by a convention that a future contributor could quietly break
with a convenient join.

## Consequences

- **Overselling is prevented at placement**, not at confirmation, because availability
  accounts for what is already promised.
- **A single transaction spanning order and stock is now impossible.** This is the real
  cost, and it is the reason [0005](0005-sole-writer-audit.md) is amended.
- Order and stock are **eventually consistent**: a cancelled order releases its stock when
  the event is delivered, not at the instant of cancellation.
- The failure mode is asymmetric in the safe direction: the worst case is stock held
  slightly longer than necessary, never stock sold twice.
- Two services to run, deploy, and observe instead of one.

## Alternatives considered

- **A module inside the workflow service.** Keeps the single transaction and is simpler,
  but does not model a bounded context and shares a release cycle.
- **A separate service sharing the order database.** Independently deployable, but the
  shared database makes the boundary advisory: nothing stops a join being added later.
- **Two-phase commit across both databases.** Restores atomicity on paper, at the cost of
  a coordinator, blocking locks, and a well-earned reputation for operational pain.

## Note on duplicated infrastructure code

The auth guard, throttler and error mapper are duplicated between the two services rather
than extracted into a shared package. That is deliberate: a shared library between
independently deployable services couples their release cycles, which is what a bounded
context is meant to avoid. Roughly forty lines of duplicated glue is a cheaper price than
that coupling. The pure domain package is shared, because it has no infrastructure in it.
