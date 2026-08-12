COMPOSE := docker compose --env-file .env -f infra/docker/compose.yaml
COMPOSE_OBS := docker compose --env-file .env -f infra/docker/compose.yaml -f infra/docker/compose.observability.yaml
PG_USER := $$(grep ^POSTGRES_USER .env | cut -d= -f2)
PG_DB := $$(grep ^POSTGRES_DB .env | cut -d= -f2)
PSQL := $(COMPOSE) exec -T postgres psql -U $(PG_USER) -d $(PG_DB)
PSQL_INV := $(COMPOSE) exec -T postgres psql -U $(PG_USER) -d $(PG_DB)_inventory

.PHONY: env up down logs seed smoke reset console gen-secrets obs-up obs-down db-init

env:
	@test -f .env || cp .env.example .env

# Print cryptographically-random secrets to paste into a deployment's .env.
# (Dev uses the checked-in defaults; never deploy with those.)
gen-secrets:
	@echo "HASURA_GRAPHQL_ADMIN_SECRET=$$(openssl rand -base64 32)"
	@echo "ACTION_SECRET=$$(openssl rand -base64 32)"
	@echo "POSTGRES_PASSWORD=$$(openssl rand -base64 24)"
	@echo "KEYCLOAK_ADMIN_PASSWORD=$$(openssl rand -base64 24)"
	@echo "NEXTAUTH_SECRET=$$(openssl rand -base64 32)  # apps/web/.env.local"

up: env
	$(COMPOSE) up -d
	@echo "Waiting for Hasura to be healthy..."
	@until [ "$$(docker inspect -f '{{.State.Health.Status}}' ecommerce-orderflow-hasura-1 2>/dev/null)" = "healthy" ]; do sleep 2; done
	@echo "Up. GraphQL: http://localhost:8080/v1/graphql  Console: http://localhost:8080/console"

down:
	$(COMPOSE) down

reset:
	$(COMPOSE) down -v

logs:
	$(COMPOSE) logs -f --tail=100

# Creates the inventory database when the Postgres volume predates it. The
# init script covers fresh volumes; this covers existing ones.
db-init:
	@$(COMPOSE) exec -T postgres psql -U $(PG_USER) -d postgres -tc \
	  "select 1 from pg_database where datname = '$(PG_DB)_inventory'" | grep -q 1 \
	  || $(COMPOSE) exec -T postgres psql -U $(PG_USER) -d postgres \
	     -c "create database $(PG_DB)_inventory"

seed:
	cat hasura/seeds/default/*/up.sql | $(PSQL)
	cat hasura/seeds/inventory/*/up.sql | $(PSQL_INV)

smoke:
	./infra/docker/smoke-test.sh

console:
	cd hasura && hasura console

# Full stack + observability (Prometheus, Tempo, Grafana). Enables trace export.
obs-up: env
	$(COMPOSE_OBS) up -d
	@echo "Waiting for Hasura to be healthy..."
	@until [ "$$(docker inspect -f '{{.State.Health.Status}}' ecommerce-orderflow-hasura-1 2>/dev/null)" = "healthy" ]; do sleep 2; done
	@echo "Up. Grafana: http://localhost:3300  Prometheus: http://localhost:9090"

obs-down:
	$(COMPOSE_OBS) down
