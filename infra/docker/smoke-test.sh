#!/usr/bin/env bash
set -euo pipefail

ADMIN_SECRET="$(grep HASURA_GRAPHQL_ADMIN_SECRET .env | cut -d= -f2)"
ENDPOINT="http://localhost:8080/v1/graphql"

query='{"query":"{ orders(order_by: {created_at: asc}, limit: 3) { id status total_cents customer { display_name role } items { quantity product { sku } } events { to_status } } }"}'

echo "→ Querying $ENDPOINT"
resp="$(curl -s -H "x-hasura-admin-secret: ${ADMIN_SECRET}" -H 'Content-Type: application/json' -d "$query" "$ENDPOINT")"
echo "$resp"

echo "$resp" | grep -q '"status":"PENDING"' || { echo "FAIL: expected a PENDING order"; exit 1; }
echo "$resp" | grep -q '"sku":"SKU-KEYB"' || { echo "FAIL: expected keyboard line item"; exit 1; }
echo "$resp" | grep -q '"role":"customer"' || { echo "FAIL: expected customer relationship"; exit 1; }
echo "✓ Smoke test passed: schema tracked, relationships resolve, seed data present."

# --- inventory bounded context ---
echo "→ Checking the inventory service"
curl -sf http://localhost:3002/health >/dev/null || { echo "FAIL: inventory service unhealthy"; exit 1; }

inv_query='{"query":"{ stock_items(order_by: {sku: asc}, limit: 3) { sku on_hand reserved } stock_alerts(where: {status: {_eq: OPEN}}) { sku level } }"}'
inv_resp="$(curl -s -H "x-hasura-admin-secret: ${ADMIN_SECRET}" -H 'Content-Type: application/json' -d "$inv_query" "$ENDPOINT")"
echo "$inv_resp"
echo "$inv_resp" | grep -q '"stock_items"' || { echo "FAIL: inventory source not reachable through GraphQL"; exit 1; }
echo "✓ Inventory smoke test passed: second data source tracked, stock readable."
