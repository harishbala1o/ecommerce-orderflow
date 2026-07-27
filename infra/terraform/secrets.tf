# App secrets generated here and stored in Secret Manager. The GKE workload
# reads them via Workload Identity (see iam.tf) — never baked into images.
resource "random_password" "app" {
  for_each = toset(["admin_secret", "action_secret", "nextauth_secret", "keycloak_admin"])
  length   = 32
  special  = false
}

locals {
  secret_values = {
    admin-secret            = random_password.app["admin_secret"].result
    action-secret           = random_password.app["action_secret"].result
    nextauth-secret         = random_password.app["nextauth_secret"].result
    keycloak-admin-password = random_password.app["keycloak_admin"].result
    postgres-password       = random_password.db.result
    # Private-IP connection string the app/Hasura use inside the VPC.
    database-url = "postgres://${var.db_user}:${random_password.db.result}@${google_sql_database_instance.postgres.private_ip_address}:5432/${var.db_name}"
  }
}

resource "google_secret_manager_secret" "app" {
  for_each  = local.secret_values
  secret_id = "orderflow-${each.key}"
  labels    = var.labels
  replication {
    auto {}
  }
  depends_on = [google_project_service.services]
}

resource "google_secret_manager_secret_version" "app" {
  for_each    = local.secret_values
  secret      = google_secret_manager_secret.app[each.key].id
  secret_data = each.value
}
