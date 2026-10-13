# Operator workflows: implementation plan

Branch `feature/operator-workflows`, based on `main` at `353b653`.
Validated in the isolated `orderflow-test` stack. Nothing merges to `main` without approval.

## Phases and status

| Phase | Scope | Status |
|-------|-------|--------|
| Test environment | Isolated stack, readiness gate, baseline | Complete |
| 0 | Safety foundations: roles, atomic receipts, idempotency, concurrency, error classes | Complete |
| 1 | Operations queue, collaboration, safe actions | Not started |
| 2 | Actionable inventory | Not started |
| 3 | Exception and reconciliation console | Not started |
| 4 | Warehouse returns | Not started |
| 5 | Cross-feature accessibility, E2E, deployment wiring, docs | Not started |

Accessibility and tests are built into each phase, not deferred to phase 5.

## Phase 0 findings, re-verified against this checkout

These were historical review findings. Each was re-checked in the current code before planning a fix.

| # | Finding | Status now | Evidence |
|---|---------|-----------|----------|
| F1 | Browser business user inherits Hasura's unrestricted `admin` | **Live** | Keycloak `ada` carries `hasura_default_role: admin`; the domain's own privileged role is also literally `admin` |
| F2 | Event dedup committed before the stock effect | **Live** | `handleOrderEvent` commits `markEventProcessed` in its own transaction, then runs release/commit separately. A failed release is permanently skipped on retry: silent stock loss |
| F3 | Placement lacks idempotency | **Live** | `placeOrder` mints a fresh `randomUUID()` per call, so a client retry creates a second order |
| F4 | Duplicate product lines under-reserve | **Live** | Each line is checked against the same pre-mutation snapshot, then the second insert hits `on conflict do nothing` and is skipped. An order for 2+3 of one SKU reserves 2 |
| F5 | Reservation retry fails after a successful first attempt | **Live** | Retry re-checks availability against stock its own first attempt already consumed |
| F6 | Expiry can release a reservation confirmed in the meantime | **Live** | Sweeper selects expired ids in one transaction and releases in another |
| F7 | Reordered or stale events produce wrong stock outcomes | **Live** | Handler switches on `to_status` with no order-state or version guard |
| F8 | Stale alert severity and movement snapshots | **Live** | `recordAndEvaluate` computes from a snapshot captured at lock time |
| F9 | Infrastructure errors classified as HTTP 400 | **Live** | Unknown errors fall through to `{code:"internal"}` returned as 400, so Hasura does not retry and the SLO never sees them |

## Phase 0 changes

**Roles.** The domain's privileged role is renamed `admin` to `business_admin` throughout
(`packages/domain`, Hasura metadata, Keycloak realms, web). Hasura's built-in `admin`
bypasses every permission check and must never be reachable from a browser session. The
business administrator becomes an explicitly permissioned role.

**Atomic event receipt.** Dedup insert and stock effect move into one inventory-database
transaction. A failed effect rolls the receipt back, so Hasura's retry genuinely reprocesses.

**Reservation correctness.** Lines are aggregated by product before validation, so duplicate
lines reserve the full quantity. Retry compares against the existing hold for the same order
and returns success when the payload matches, conflict when it differs.

**Placement idempotency.** `idempotency_keys` in the order database, scoped to
operation plus actor plus a payload fingerprint. Same key and same payload replays the stored
result; same key and different payload is a conflict.

**Expiry race.** The sweeper re-checks `expires_at` inside the releasing transaction.

**Event ordering.** Handlers become state-aware: a release or commit verifies the reservation
is still `HELD` and that the event is not stale relative to the order's recorded version.

**Error classes.** Validation, authorization, conflict, not-found and infrastructure become
distinct classes mapping to 400, 403, 409, 404 and 500. Infrastructure failures must surface
as 5xx so they are retried and counted.

**Optimistic concurrency.** `orders.version` increments on every transition. State-changing
operator actions carry an expected version; a mismatch is a 409 with the current state.

## Schema changes

Order database:

- `orders.version integer not null default 1`, bumped on every transition.
- `idempotency_keys(key, operation, actor_id, fingerprint, response, status, created_at)`,
  unique on `(operation, actor_id, key)`.

Inventory database: no schema change in phase 0; the fixes are transactional and in-code.

Later phases add: `order_assignments`, `order_notes`, `exception_records`, `return_cases`,
`return_case_lines`, `return_restock_instructions`, plus queue indexes.

## Permission matrix (phase 0 target)

| Capability | customer | ops | business_admin | Hasura `admin` |
|---|---|---|---|---|
| Read own orders | yes | n/a | n/a | not browser-reachable |
| Read all orders | no | yes | yes | not browser-reachable |
| Read users | own row | all | all | not browser-reachable |
| Read stock levels (`stock_items`) | no | yes | yes | not browser-reachable |
| Read availability (`stock_availability`) | yes | yes | yes | not browser-reachable |
| Read stock alerts | no | yes | yes | not browser-reachable |
| `placeOrder` | yes | no | no | not browser-reachable |
| `transitionOrder` | own, cancel only | yes | yes incl. force-cancel after shipment | not browser-reachable |

Hasura's built-in `admin` remains available only to server-side tooling holding the admin
secret. No browser session is issued that role.

## Business policies chosen (recorded in ADR 0009)

- Force cancellation after shipment does **not** replenish sellable stock. It records an
  audited physical-reconciliation requirement; replenishment happens only through the
  warehouse return process.
- `available = sellable_on_hand - reserved`. Damaged and quarantined units are outside
  sellable stock.
- One warehouse, whole-order outbound fulfilment, one return case per order.
- Aging indicators, not SLA breaches, until a real SLA policy is configured.

## Risks

- Renaming the privileged role touches domain, metadata, realm and UI together. Mitigated by
  doing it as one atomic change with tests, and by the test stack already using the new role.
- Adding `orders.version` changes an applied migration's table. Mitigated with a new forward
  migration, never editing an applied one, and validating on both a fresh stack and an
  upgrade fixture.
- Moving dedup inside the effect transaction lengthens the transaction. Acceptable: the
  effect is a handful of indexed writes.

## Phase 0 acceptance results

All verified in the `orderflow-test` stack on commit `bd1c2a1`.

| Acceptance test | Result |
|---|---|
| business_admin cannot perform an unrestricted Hasura query | Pass: 21/21 in `test-permissions.sh`; insert, bulk update and untracked reads all denied |
| A failed stock effect leaves no receipt and the retry applies once | Pass: regression test, and it fails against the previous code |
| Duplicate product lines reserve the summed quantity | Pass: 2+3 reserves 5, verified live through GraphQL |
| Identical reservation replay succeeds; changed payload conflicts | Pass |
| Identical placement replay returns the original order; changed payload conflicts | Pass, verified live |
| A hold confirmed between sweeper selection and release is not reclaimed | Pass |
| A stale expected version is rejected with the current state | Pass, verified live with two operators |
| Infrastructure failures surface as 5xx, not 400 | Pass: 400 malformed, 404 unknown, 409 conflict, 500 unknown |

Still to do, carried into later phases: a forced database outage asserting 5xx end to end,
and a crash-during-recovery test, which belongs with the reconciliation work in phase 3.

## Phase 0 acceptance tests (as planned)

- A `business_admin` session cannot perform an unrestricted Hasura query; it sees exactly the
  permitted columns and rows.
- An event whose stock effect throws leaves no `processed_events` row, and the retry applies
  the effect exactly once.
- An order with the same product on two lines reserves the summed quantity.
- Replaying a reservation with an identical payload succeeds and changes stock once;
  replaying with a different payload is a conflict.
- Replaying `placeOrder` with the same idempotency key returns the original order;
  a different payload under the same key is a conflict.
- A reservation confirmed between sweeper selection and release is not released.
- A transition with a stale expected version is rejected with the current state.
- A forced database failure surfaces as 5xx, not 400.
