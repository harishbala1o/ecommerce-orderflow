# 2. Sync Actions when the caller needs the result; async Event Triggers otherwise

Date: 2026-07-20 · Status: Accepted

## Context

Given the Hasura + service split ([0001](0001-hasura-plus-workflow-service.md)), the
service is reached two ways: Hasura **Actions** (synchronous, request/response) and
Hasura **Event Triggers** (asynchronous, at-least-once with retries). We need a rule for
which to use so the boundary stays predictable.

## Decision

- **Synchronous Action** when the caller needs the outcome to proceed — placing an order,
  advancing its state. The mutation returns the new state.
- **Asynchronous Event Trigger** for side effects that can happen after the response and
  must survive retries — notifications, and any fan-out off a committed `order_events`
  row.

## Consequences

- Mutations stay fast; retryable side effects don't block the user.
- At-least-once delivery forces side-effect handlers to be **idempotent** — keyed on the
  Hasura delivery id via a `processed_events` table.
- The state transition and its audit row are committed in one DB transaction (synchronous
  path), so the async consumer always sees a consistent event.

## Alternatives considered

- **All synchronous**: simpler mental model, but couples user latency to every side
  effect and loses built-in retries.
- **A separate message broker (Kafka/RabbitMQ)**: more capable, but disproportionate
  infrastructure for this scope; revisit if fan-out grows.
