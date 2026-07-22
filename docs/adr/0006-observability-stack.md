# 6. OpenTelemetry + Prometheus + Tempo + Grafana for observability

Date: 2026-07-20 · Status: Accepted

## Context

A distributed request (dashboard → Hasura → Action → service → Postgres) needs to be
understandable in production: what happened, how often, how slow, and why a specific
request failed. That means metrics, traces, and logs that correlate.

## Decision

Instrument the workflow service with **OpenTelemetry** (vendor-neutral) for traces,
**prom-client** for metrics, and **pino** for structured logs; run **Prometheus**
(metrics), **Tempo** (traces), and **Grafana** (single pane) locally. Traces export via
OTLP straight to Tempo (its built-in OTLP receiver — no separate collector for this
scope). Logs carry the active `trace_id` so a log line links to its trace. Metrics
include domain signals (`orderflow_transitions_total`, `orderflow_orders_placed_total`),
not just RED.

## Consequences

- Standard, portable instrumentation (OTel) — swap backends without touching app code.
- Domain metrics make the dashboard meaningful (orders by state, transition counts), not
  just generic infra graphs.
- Extra services to run; kept behind a compose profile (`make obs-up`) so the base stack
  stays light.

## Alternatives considered

- **A hosted APM (Datadog/New Relic)**: less to run, but a paid external dependency and
  less to demonstrate.
- **An OTel Collector in the middle**: the production-correct topology (buffering,
  fan-out); omitted here because direct OTLP → Tempo is sufficient at this scale.
