terraform {
  required_version = ">= 1.6"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state. Create the bucket once (see infra/terraform/README.md), then
  # `terraform init -backend-config="bucket=YOUR_TF_STATE_BUCKET"`.
  backend "gcs" {
    prefix = "orderflow/state"
  }
}
