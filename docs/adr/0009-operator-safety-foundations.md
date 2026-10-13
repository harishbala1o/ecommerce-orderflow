# 9. Operator safety foundations: roles, idempotency, and concurrency

Date: 2026-10-13 · Status: Accepted · Amends [0005](0005-sole-writer-audit.md)

## Context

Operator features (a work queue, stock receipts, reconciliation, returns) all mutate shared
state that several people touch at once. Before building them, the existing foundations were
re-examined against the running system. Four problems made those features unsafe to build on.

**A browser session held Hasura's superuser.** The business administrator persona carried
`hasura_default_role: admin`. Hasura reserves `admin` for a built-in role that bypasses every
permission check, so that session could insert orders, rewrite any order's status in bulk and
read untracked tables straight from the browser, with no audit row and no state-machine
validation. This was demonstrated, not assumed.

**A failed stock effect was lost permanently.** The inventory event handler recorded the
Hasura delivery id in its own transaction and then applied the stock effect separately. If
the effect failed, the receipt had already committed, so Hasura's retry found the id recorded
and skipped. An order could end up cancelled with its stock still held, and nothing reported it.

**Reservations were not replay-safe.** An order listing the same product on two lines
reserved less than it sold, because each line was validated against the same pre-mutation
snapshot and the second insert was swallowed by a unique constraint. A retry of a request
that had already succeeded was refused, because it re-checked availability that its own first
attempt had consumed.

**Nothing prevented two operators overwriting each other**, and there was no way to retry a
placement safely.

## Decision

**Roles.** The domain's privileged role is `business_admin`, never `admin`. Hasura's built-in
`admin` belongs only to server-side tooling holding the admin secret; no browser session is
issued it. The workflow service derives its accepted role list from the domain's `ROLES` so
the two cannot drift.

**Atomic receipts.** Where the effect and the receipt share a database, they share a
transaction. The inventory handler commits the dedup row and the stock change together.

**Idempotency.** State-changing operations accept a key scoped to
`(operation, actor, key)` with a payload fingerprint. The same key with the same payload
replays the stored response; with a different payload it is a conflict. `in_progress` is a
durable claim, never treated as success.

**Optimistic concurrency.** `orders.version` increments on every transition. A request may
carry the version it believes it is acting on, and a mismatch is a 409 naming the current
version and status.

**Error classes.** Validation, authorization, conflict, not-found and infrastructure are
distinct, and unrecognised failures surface as 5xx. A blanket 400 told Hasura that a failed
delivery had been validly rejected, which stopped the retry.

## Consequences

- Replay safety rests on two independent guards, not one: the receipt, and the fact that
  release and commit act only on reservations still `HELD`. A duplicate that somehow got past
  the ledger still changes nothing, and a reordered cancel/ship pair applies only the first.
- Idempotency keys are optional, so existing clients keep working. The protection only
  applies when the caller opts in by sending one.
- A `business_admin` session can no longer do anything not explicitly permitted. Any new
  table needs an explicit grant, which is the point.
- Transactions are slightly longer, since the receipt now shares one with the effect. The
  effect is a handful of indexed writes, so this is not a meaningful cost.
- Audit rows keep whatever role string was recorded at the time. Rewriting history to use the
  new role name would falsify the audit trail.

## Business policies chosen

These were not previously written down. They are recorded here rather than left implicit:

- **Force cancellation after shipment does not replenish sellable stock.** The goods are
  physically gone. It records an audited physical-reconciliation requirement instead;
  replenishment happens only through the warehouse return process.
- **`available = sellable_on_hand - reserved`.** Damaged and quarantined units sit outside
  sellable stock and never count toward availability.
- **One warehouse, whole-order outbound fulfilment, one return case per order.**
- **Aging indicators, not SLA breaches**, until a real SLA policy is configured. Calling an
  arbitrary threshold a breach would misrepresent a commitment nobody made.

## Alternatives considered

- **Keeping `admin` and restricting it in Hasura.** Not possible: Hasura rejects permissions
  defined for `admin` precisely because it bypasses them.
- **Pessimistic locking for operator actions.** Correct but hostile: an operator reading an
  order would block others. Optimistic versioning fails only on actual conflict.
- **Server-generated idempotency keys.** Cannot work, since the client needs the same key
  across a retry it makes after seeing no response.
