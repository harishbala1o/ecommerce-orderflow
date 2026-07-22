# Architecture Decision Records

Short records of the significant decisions on this project and *why* they were made.
Format is lightweight [MADR](https://adr.github.io/madr/). Newest decisions supersede
older ones explicitly.

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-hasura-plus-workflow-service.md) | Hasura for data access + a dedicated service for invariants | Accepted |
| [0002](0002-sync-actions-async-events.md) | Sync Actions when the caller needs the result; async Event Triggers otherwise | Accepted |
| [0003](0003-nestjs-workflow-service.md) | NestJS (TypeScript) for the workflow service | Accepted |
| [0004](0004-keycloak-oidc.md) | Keycloak (self-hosted OIDC) for authentication + role claims | Accepted |
| [0005](0005-sole-writer-audit.md) | The service is the sole writer of order state, with an append-only audit log | Accepted |
| [0006](0006-observability-stack.md) | OpenTelemetry + Prometheus + Tempo + Grafana for observability | Accepted |
