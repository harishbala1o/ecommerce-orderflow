# Kubernetes (Helm) deployment

A Helm chart for Ecommerce OrderFlow with `dev` (kind-friendly) defaults and a
`values-prod.yaml` hardening overlay.

## Chart contents

- **postgres** — StatefulSet + Service + PVC (dev only; disable in prod for a managed DB)
- **hasura** — Deployment + Service; uses a custom image that **bakes the migrations +
  metadata** (`infra/docker/hasura.Dockerfile`) so they self-apply in-cluster
- **workflow-service** — Deployment + Service + **HPA** + **NetworkPolicy** (only Hasura
  may reach it) + liveness/readiness probes + resource requests/limits
- **keycloak** — Deployment + Service + realm ConfigMap
- **web** — Deployment + Service
- **secret** — dev secrets (prod expects an existing Secret via `secrets.existingSecret`)

## Local deploy on kind

```bash
kind create cluster --name orderflow

# Build + load the images kind can't pull (custom + local)
docker build -f infra/docker/hasura.Dockerfile -t orderflow/hasura:dev .
docker build -f apps/workflow-service/Dockerfile -t orderflow/workflow-service:dev .
kind load docker-image orderflow/hasura:dev orderflow/workflow-service:dev --name orderflow

helm install orderflow infra/helm/orderflow -n orderflow --create-namespace

kubectl -n orderflow rollout status deploy/orderflow-hasura
kubectl -n orderflow port-forward svc/orderflow-hasura 8080:8080
# GraphQL now at http://localhost:8080/v1/graphql
```

**Core-path smoke** (Postgres + Hasura + workflow-service, admin-secret only — no
Keycloak/web), which is what CI/this repo verified live:

```bash
helm install orderflow infra/helm/orderflow -n orderflow --create-namespace \
  --set keycloak.enabled=false --set web.enabled=false --set hasura.jwt.enabled=false
```

## Production

```bash
# Provision the Secret out-of-band first (see keys in templates/secret.yaml):
kubectl create secret generic orderflow-secrets -n orderflow \
  --from-literal=admin-secret=... --from-literal=action-secret=... \
  --from-literal=database-url=postgres://... --from-literal=nextauth-secret=... \
  --from-literal=keycloak-admin-password=... --from-literal=postgres-password=...

helm install orderflow infra/helm/orderflow -n orderflow \
  -f infra/helm/orderflow/values-prod.yaml
```

The prod overlay sets `HASURA_GRAPHQL_DEV_MODE=false`, disables the console, locks CORS to
the dashboard origin, uses an external (managed) Postgres, raises replicas, and sources
all secrets from the pre-provisioned Secret — realizing the hardening in
[`SECURITY.md`](../../SECURITY.md). TLS is terminated at the ingress (not included here).

## Verified

`helm lint` clean; `helm template` renders for both dev and prod overlays; the core path
(Postgres + baked Hasura + workflow-service, HPA + NetworkPolicy) was deployed to a local
kind cluster with migrations self-applying and GraphQL returning seeded data. Full
in-cluster Keycloak/web browser OIDC needs an ingress with matching issuer URLs (left for
a cloud deploy).
