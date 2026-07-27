# Google service account the in-cluster workload impersonates via Workload
# Identity. Bound to the Kubernetes SA "orderflow/orderflow" (namespace/name).
resource "google_service_account" "workload" {
  account_id   = "orderflow-workload"
  display_name = "OrderFlow workload (Workload Identity)"
}

resource "google_project_iam_member" "workload_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.workload.email}"
}

resource "google_project_iam_member" "workload_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.workload.email}"
}

# Let the Kubernetes SA act as the Google SA.
resource "google_service_account_iam_member" "workload_identity" {
  service_account_id = google_service_account.workload.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[orderflow/orderflow]"
}
