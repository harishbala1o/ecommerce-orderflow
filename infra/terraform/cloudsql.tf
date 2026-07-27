resource "random_password" "db" {
  length  = 24
  special = false
}

resource "google_sql_database_instance" "postgres" {
  name             = local.name
  region           = var.region
  database_version = "POSTGRES_16"

  depends_on = [google_service_networking_connection.private_service_connection]

  settings {
    tier              = var.db_tier
    availability_type = "ZONAL" # REGIONAL for HA (costs more)
    disk_size         = 10
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false # private IP only
      private_network = google_compute_network.vpc.id
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
    }

    user_labels = var.labels
  }

  deletion_protection = false # demo
}

resource "google_sql_database" "app" {
  name     = var.db_name
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "app" {
  name     = var.db_user
  instance = google_sql_database_instance.postgres.name
  password = random_password.db.result
}
