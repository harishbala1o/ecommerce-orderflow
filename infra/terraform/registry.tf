# Artifact Registry for the workflow-service / web images (alternative to GHCR
# when you want images co-located with the cluster).
resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = "orderflow"
  format        = "DOCKER"
  description   = "OrderFlow container images"
  labels        = var.labels
  depends_on    = [google_project_service.services]
}
