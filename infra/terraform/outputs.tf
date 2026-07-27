output "cluster_name" {
  value       = google_container_cluster.autopilot.name
  description = "GKE cluster name (for `gcloud container clusters get-credentials`)."
}

output "cluster_location" {
  value = google_container_cluster.autopilot.location
}

output "db_instance_connection_name" {
  value       = google_sql_database_instance.postgres.connection_name
  description = "Cloud SQL connection name."
}

output "db_private_ip" {
  value = google_sql_database_instance.postgres.private_ip_address
}

output "artifact_registry_repo" {
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
  description = "Docker repository URL to push images to."
}

output "workload_service_account" {
  value       = google_service_account.workload.email
  description = "Annotate the Kubernetes SA with this via iam.gke.io/gcp-service-account."
}
