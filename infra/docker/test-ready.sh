#!/usr/bin/env bash
# Readiness gate for the isolated test stack.
#
# Blocks until every dependency is genuinely serving, not merely "container
# started". A demo or an E2E run that races boot produces misleading failures,
# so this is the single place that decides the stack is usable.
set -euo pipefail

HASURA="${HASURA_TEST_URL:-http://localhost:18080}"
KEYCLOAK="${KEYCLOAK_TEST_URL:-http://localhost:18081}"
WORKFLOW="${WORKFLOW_TEST_URL:-http://localhost:13001}"
INVENTORY="${INVENTORY_TEST_URL:-http://localhost:13002}"
REALM="orderflow-test"
DEADLINE=$((SECONDS + 240))

wait_for() {
  local name="$1" url="$2"
  printf '  %-22s' "$name"
  until curl -sf -o /dev/null "$url"; do
    if (( SECONDS > DEADLINE )); then
      echo "TIMEOUT ($url)"
      exit 1
    fi
    sleep 2
  done
  echo "ready"
}

echo "Waiting for the orderflow-test stack:"
wait_for "workflow-service" "$WORKFLOW/health"
wait_for "inventory-service" "$INVENTORY/health"
wait_for "keycloak realm" "$KEYCLOAK/realms/$REALM/.well-known/openid-configuration"
wait_for "hasura" "$HASURA/healthz"

# Hasura reports healthy before metadata is necessarily consistent, and an
# inconsistent source silently breaks reads, so check it explicitly.
admin_secret="$(grep '^HASURA_GRAPHQL_ADMIN_SECRET=' .env.test | cut -d= -f2-)"
printf '  %-22s' "hasura metadata"
consistent="$(curl -s -H "x-hasura-admin-secret: ${admin_secret}" \
  -H 'Content-Type: application/json' \
  -d '{"type":"get_inconsistent_metadata","args":{}}' \
  "$HASURA/v1/metadata" | python3 -c 'import json,sys; print(json.load(sys.stdin)["is_consistent"])')"
if [ "$consistent" != "True" ]; then
  echo "INCONSISTENT"
  curl -s -H "x-hasura-admin-secret: ${admin_secret}" -H 'Content-Type: application/json' \
    -d '{"type":"get_inconsistent_metadata","args":{}}' "$HASURA/v1/metadata" | head -c 2000
  exit 1
fi
echo "consistent"

echo "Test stack ready:  Hasura $HASURA  ·  Keycloak $KEYCLOAK/realms/$REALM"
