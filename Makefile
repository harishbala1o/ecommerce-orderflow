COMPOSE := docker compose --env-file .env -f infra/docker/compose.yaml
PSQL := $(COMPOSE) exec -T postgres psql -U $$(grep POSTGRES_USER .env | cut -d= -f2) -d $$(grep POSTGRES_DB .env | cut -d= -f2)

.PHONY: env up down logs seed smoke reset console

env:
	@test -f .env || cp .env.example .env

up: env
	$(COMPOSE) up -d
	@echo "Waiting for Hasura to be healthy..."
	@until [ "$$(docker inspect -f '{{.State.Health.Status}}' orderflow-hasura-1 2>/dev/null)" = "healthy" ]; do sleep 2; done
	@echo "Up. GraphQL: http://localhost:8080/v1/graphql  Console: http://localhost:8080/console"

down:
	$(COMPOSE) down

reset:
	$(COMPOSE) down -v

logs:
	$(COMPOSE) logs -f --tail=100

seed:
	cat hasura/seeds/default/*/up.sql | $(PSQL)

smoke:
	./infra/docker/smoke-test.sh

console:
	cd hasura && hasura console
