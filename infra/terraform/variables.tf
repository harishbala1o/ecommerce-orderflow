variable "project_id" {
  type        = string
  description = "GCP project id to deploy into."
}

variable "region" {
  type        = string
  description = "GCP region."
  default     = "us-central1"
}

variable "environment" {
  type        = string
  description = "Environment name, used in resource names and labels."
  default     = "prod"
}

variable "db_tier" {
  type        = string
  description = "Cloud SQL machine tier. db-f1-micro / db-g1-small are cheapest for a demo."
  default     = "db-g1-small"
}

variable "db_name" {
  type    = string
  default = "ecommerce_orderflow"
}

variable "db_user" {
  type    = string
  default = "ecommerce_orderflow"
}

variable "labels" {
  type        = map(string)
  description = "Labels applied to all resources that support them."
  default = {
    app        = "orderflow"
    managed-by = "terraform"
  }
}
