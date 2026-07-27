# Terraform — GKE deployment (Phase 2)

Provisions the cloud footprint for a production-shaped deployment on GCP:

- **VPC** + subnet with secondary ranges (VPC-native networking)
- **GKE Autopilot** cluster (Google-managed nodes, Workload Identity)
- **Cloud SQL for PostgreSQL 16** with a **private IP** (via Private Service Access)
- **Artifact Registry** Docker repo
- **Secret Manager** secrets (app secrets + DB connection string, generated here)
- A **Workload Identity** service account bound to the K8s SA `orderflow/orderflow`,
  with `cloudsql.client` + `secretmanager.secretAccessor`

> Status: written and `terraform validate`-clean. **Not applied** — applying needs a
> billing-enabled GCP project and your credentials. `terraform plan`/`apply` require
> auth, so they are not run in this repo's CI.

## Cost warning

GKE Autopilot + Cloud SQL are **not free** (roughly a few USD/day for this size). Treat
this as spin-up → demo → **`terraform destroy`**. Nothing here is meant to run 24/7.

## Apply runbook

```bash
# 0. Auth + pick a project
gcloud auth application-default login
gcloud config set project YOUR_PROJECT_ID

# 1. One-time: a GCS bucket for remote state
gsutil mb -l us-central1 gs://YOUR_TF_STATE_BUCKET

# 2. Configure inputs
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars   # edit project_id, region

# 3. Init (points the gcs backend at your bucket) + review + apply
terraform init -backend-config="bucket=YOUR_TF_STATE_BUCKET"
terraform plan
terraform apply

# 4. Wire kubectl to the new cluster
gcloud container clusters get-credentials "$(terraform output -raw cluster_name)" \
  --region "$(terraform output -raw cluster_location)"

# 5. Deploy the app with the Helm chart (Phase-1 M5c), prod overlay.
#    - Postgres is external (Cloud SQL) → postgres.enabled=false is already set in
#      values-prod.yaml; point the chart's Secret at Secret Manager (or sync it with
#      External Secrets Operator) and annotate the K8s SA for Workload Identity:
kubectl create namespace orderflow
kubectl -n orderflow create serviceaccount orderflow
kubectl -n orderflow annotate serviceaccount orderflow \
  iam.gke.io/gcp-service-account="$(terraform output -raw workload_service_account)"
helm install orderflow ../helm/orderflow -n orderflow -f ../helm/orderflow/values-prod.yaml

# 6. When done — tear it all down to stop the meter
terraform destroy
```

## Notes

- Images: push to the Artifact Registry repo from `terraform output -raw artifact_registry_repo`
  (or keep using GHCR — the Helm `images.*` values accept any registry).
- Secrets: this config generates and stores them in Secret Manager. For a real setup, wire
  them into the cluster with the External Secrets Operator or the Secret Manager CSI driver
  rather than copying by hand.
- TLS/ingress and DNS are intentionally out of scope here; add a GKE Gateway/Ingress +
  managed certificate when you attach a domain.
