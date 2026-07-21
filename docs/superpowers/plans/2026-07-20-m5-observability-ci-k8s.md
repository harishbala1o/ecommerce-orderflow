# M5 — Observability + CI + Kubernetes + ADRs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Complete Phase 1: make the system observable (logs, metrics, traces in one
Grafana), enforce quality in CI, make it deployable to Kubernetes, and record the "why"
as ADRs.

**Decomposition (each sub-milestone is independently verifiable and shippable):**
- **M5a — Observability** ← *do first; the portfolio headline, verifiable locally*
- **M5b — CI** (GitHub Actions)
- **M5c — Kubernetes** (Helm + kind)
- **M5d — Docs** (ADRs + README architecture)

## Global constraints
- Commits authored solely by the owner; no AI mentions. TS strict.
- Observability stack lives in compose behind a profile so the base `make up` stays light.
- All config committed & reproducible (no click-built dashboards).

---

## M5a — Observability

**Approach:** instrument the workflow service (the code we own) with the three pillars,
run a local OTel/Prometheus/Tempo/Loki/Grafana stack, and prove a request shows up as
metrics + logs + a trace.

### Metrics (Prometheus)
- Add `prom-client` to the workflow service; expose `GET /metrics`.
- Default process metrics + **domain metrics**:
  - `orderflow_transitions_total{action,from,to,role}` (counter)
  - `orderflow_orders_placed_total{role}` (counter)
  - `orderflow_action_duration_seconds` (histogram, labels: route, outcome)
- `MetricsModule` with a `MetricsService` wrapping the registry; increment from
  `OrdersService`; an interceptor times action routes.

### Tracing (OpenTelemetry)
- Add `@opentelemetry/sdk-node` + auto-instrumentations (http, express, pg).
- A `tracing.ts` bootstrapped before Nest; OTLP/HTTP exporter → otel-collector.
- Manual span `order.transition` around the transactional core with attributes
  (`order.id`, `order.action`, `order.role`).

### Logging (pino → Loki)
- Replace the default Nest logger with `nestjs-pino` (JSON logs).
- Include `trace_id` (from the active OTel span) on each log so logs ↔ traces correlate.
- Collector/Grafana Alloy (or Promtail) ships container logs to Loki. Simplest:
  Grafana Alloy scraping the Docker logs, or pino → stdout → Alloy.

### Local stack (compose `observability` profile)
- `otel-collector` (receives OTLP, exports to Tempo + Prometheus remote-write or
  exposes a scrape endpoint), `tempo`, `loki`, `prometheus`, `grafana`.
- Provisioned: Grafana datasources (Prometheus, Tempo, Loki) + one dashboard JSON
  (`observability/grafana/dashboards/orderflow.json`) with RED + domain panels and a
  traces panel. Prometheus scrape config for the workflow service.

### Verify
- `make up` (+ observability profile) → drive several place/transition/cancel actions →
  Grafana shows request rate/latency, transition counts by action, and a trace spanning
  the action → pg; a log line carries the matching `trace_id`.

---

## M5b — CI (GitHub Actions)

- `.github/workflows/ci.yaml`: on push/PR — install (pnpm, cached) → lint → typecheck →
  unit tests → workflow-service integration tests (Testcontainers; Docker available on
  GH runners) → build all packages. Matrix Node 22.
- `.github/workflows/e2e.yaml` (or a job): `docker compose up` the stack, seed, run
  Playwright, upload the report artifact.
- `.github/workflows/images.yaml`: build the workflow-service + web images, push to GHCR
  on tags/main. Hasura migrations validated (`hasura migrate` dry check) in CI.
- README CI badge.
- Verify: push a branch, `gh run watch` until green.

## M5c — Kubernetes (Helm + kind)

- `infra/helm/orderflow/` chart: Deployments/Services for postgres (or a note to use a
  managed DB), hasura, keycloak, workflow-service, web; ConfigMaps for non-secret config;
  `Secret` refs for secrets; liveness/readiness probes; resource requests/limits; an HPA
  on the workflow service; a `NetworkPolicy` restricting the service to Hasura.
- `dev`/`prod` values overlays; prod values set `HASURA_GRAPHQL_DEV_MODE=false`, console
  off, CORS locked.
- `infra/helm/README.md`: `kind create cluster` → build/load images → `helm install`.
- Verify: install on a local kind cluster; pods Ready; port-forward; smoke.

## M5d — Docs (ADRs + architecture)

- `docs/adr/` (MADR format): 0001 Hasura+service split; 0002 sync Actions vs async
  Events; 0003 NestJS; 0004 Keycloak/OIDC; 0005 sole-writer + audit invariant;
  0006 observability stack choice.
- README: architecture diagram, an "observability" section with a screenshot/GIF of the
  trace + dashboard, CI badge.
- Update PROJECT_CONTEXT status → Phase 1 complete.

---

## Self-Review
- M5a is the headline and is locally verifiable end-to-end. ✅
- M5b/M5c/M5d each ship independently; none blocks the others. ✅
- Prod-hardening config (from the security review) is realized in M5c's prod values. ✅
