COMPOSE := docker compose --env-file .env -f infra/docker/compose.yaml
COMPOSE_OBS := docker compose --env-file .env -f infra/docker/compose.yaml -f infra/docker/compose.observability.yaml
PG_USER := $$(grep ^POSTGRES_USER .env | cut -d= -f2)
PG_DB := $$(grep ^POSTGRES_DB .env | cut -d= -f2)
PSQL := $(COMPOSE) exec -T postgres psql -U $(PG_USER) -d $(PG_DB)
PSQL_INV := $(COMPOSE) exec -T postgres psql -U $(PG_USER) -d $(PG_DB)_inventory

.PHONY: env up down logs seed smoke reset console gen-secrets obs-up obs-down db-init \
        test-env test-env-check test-build test-up test-db-init test-ready test-seed \
        test-seed-bulk test-logs test-ps test-psql test-down test-reset

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

# ---------------------------------------------------------------------------
# Isolated test stack (project `orderflow-test`).
#
# Separate project name, ports, databases, volume, network and Keycloak realm,
# so it cannot read or destroy anything in the dev stack. Every target below is
# scoped to COMPOSE_TEST; none of them touch the dev project.
# ---------------------------------------------------------------------------
COMPOSE_TEST := docker compose -p orderflow-test --env-file .env.test \
  -f infra/docker/compose.yaml -f infra/docker/compose.test.yaml
PSQL_TEST := $(COMPOSE_TEST) exec -T postgres psql -U orderflow_test -d orderflow_test
PSQL_TEST_INV := $(COMPOSE_TEST) exec -T postgres psql -U orderflow_test -d orderflow_test_inventory

# Generate .env.test with random local-only secrets. Never overwrites silently.
test-env:
	@test ! -f .env.test || { echo ".env.test already exists; delete it first to regenerate."; exit 1; }
	@sed \
	  -e "s|CHANGE_ME_POSTGRES|$$(openssl rand -hex 16)|g" \
	  -e "s|CHANGE_ME_ADMIN_SECRET|$$(openssl rand -hex 24)|g" \
	  -e "s|CHANGE_ME_ACTION_SECRET|$$(openssl rand -hex 24)|g" \
	  -e "s|CHANGE_ME_KEYCLOAK|$$(openssl rand -hex 16)|g" \
	  .env.test.example > .env.test
	@echo "Wrote .env.test with freshly generated local-only secrets."

test-build:
	$(COMPOSE_TEST) build workflow-service inventory-service

test-up: test-env-check
	$(COMPOSE_TEST) up -d
	@$(MAKE) test-db-init
	@$(MAKE) test-ready

# The inventory database for volumes created before it existed.
test-db-init:
	@$(COMPOSE_TEST) exec -T postgres psql -U orderflow_test -d postgres -tc \
	  "select 1 from pg_database where datname = 'orderflow_test_inventory'" | grep -q 1 \
	  || $(COMPOSE_TEST) exec -T postgres psql -U orderflow_test -d postgres \
	     -c "create database orderflow_test_inventory"

# Block until every dependency is actually serving, so a demo never races boot.
test-ready:
	@./infra/docker/test-ready.sh

test-seed:
	cat hasura/seeds/default/*/up.sql | $(PSQL_TEST)
	cat hasura/seeds/inventory/*/up.sql | $(PSQL_TEST_INV)

# Larger synthetic dataset for queue pagination and exception work.
test-seed-bulk:
	cat hasura/seeds/test/*.sql | $(PSQL_TEST)

test-logs:
	$(COMPOSE_TEST) logs -f --tail=100

test-ps:
	$(COMPOSE_TEST) ps

test-psql:
	$(COMPOSE_TEST) exec postgres psql -U orderflow_test -d orderflow_test

test-down:
	$(COMPOSE_TEST) down

# Drops ONLY the orderflow-test volume. The dev stack is a different project.
test-reset:
	$(COMPOSE_TEST) down -v

test-env-check:
	@test -f .env.test || { echo "Missing .env.test. Run: make test-env"; exit 1; }


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
