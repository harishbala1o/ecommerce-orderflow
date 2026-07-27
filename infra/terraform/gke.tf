# GKE Autopilot: Google manages nodes, scaling, and security posture — the
# cheapest and lowest-ops way to run this workload in a "production-shaped" way.
resource "google_container_cluster" "autopilot" {
  provider = google-beta
  name     = local.name
  location = var.region

  enable_autopilot = true

  network    = google_compute_network.vpc.id
  subnetwork = google_compute_subnetwork.subnet.id

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  # Workload Identity is always on for Autopilot; declared for clarity.
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  release_channel {
    channel = "REGULAR"
  }

  deletion_protection = false # demo: allow `terraform destroy` to tear it down

  depends_on = [google_project_service.services]
}
