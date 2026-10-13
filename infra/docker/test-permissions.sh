#!/usr/bin/env bash
# Authorization matrix test against the running orderflow-test stack.
#
# These assertions cannot be made in a unit test: they are properties of the
# deployed Hasura metadata plus the Keycloak token mapping, which is exactly
# where the privilege-escalation risk lives. Each case asserts desired
# behaviour, not the presence of a historical bug.
set -uo pipefail

GQL="${HASURA_TEST_URL:-http://localhost:18080}/v1/graphql"
TOKEN_URL="${KEYCLOAK_TEST_URL:-http://localhost:18081}/realms/orderflow-test/protocol/openid-connect/token"
pass=0; fail=0

token() {
  curl -s "$TOKEN_URL" -d grant_type=password -d client_id=web \
    -d "username=$1" -d password=demo1234 \
    | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))'
}

# assert <name> <allow|deny> <token> <query>
assert() {
  local name="$1" expect="$2" tok="$3" query="$4"
  local body
  body="$(curl -s "$GQL" -H "Authorization: Bearer $tok" -H 'Content-Type: application/json' -d "$query")"
  local denied=no
  if printf '%s' "$body" | grep -qE '"code":"(validation-failed|access-denied|permission-error)"'; then
    denied=yes
  fi
  local ok=no
  { [ "$expect" = deny ] && [ "$denied" = yes ]; } && ok=yes
  { [ "$expect" = allow ] && [ "$denied" = no ]; } && ok=yes
  if [ "$ok" = yes ]; then
    printf '  ok    %-58s (%s)\n' "$name" "$expect"; pass=$((pass+1))
  else
    printf '  FAIL  %-58s expected %s\n        %s\n' "$name" "$expect" "${body:0:200}"; fail=$((fail+1))
  fi
}

CARA="$(token cara)"; OTTO="$(token otto)"; ADA="$(token ada)"
for t in CARA OTTO ADA; do
  [ -n "${!t}" ] || { echo "could not obtain a token for $t"; exit 1; }
done

echo "Authorization matrix:"

# The business administrator must be a scoped role, never Hasura's built-in
# admin, which bypasses every permission check.
role="$(printf '%s' "$ADA" | cut -d. -f2 | base64 -d 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("hasura_default_role"))')"
if [ "$role" = "business_admin" ]; then
  printf '  ok    %-58s (%s)\n' "business admin is not Hasura admin" "$role"; pass=$((pass+1))
else
  printf '  FAIL  %-58s got %s\n' "business admin is not Hasura admin" "$role"; fail=$((fail+1))
fi

assert "customer reads own orders"            allow "$CARA" '{"query":"{ orders(limit:1){ id } }"}'
assert "customer cannot read stock levels"    deny  "$CARA" '{"query":"{ stock_items(limit:1){ on_hand reserved } }"}'
assert "customer cannot read stock alerts"    deny  "$CARA" '{"query":"{ stock_alerts(limit:1){ id } }"}'
assert "customer reads availability"          allow "$CARA" '{"query":"{ stock_availability(limit:1){ available } }"}'

assert "ops reads all orders"                 allow "$OTTO" '{"query":"{ orders(limit:1){ id customer_id } }"}'
assert "ops reads stock levels"               allow "$OTTO" '{"query":"{ stock_items(limit:1){ on_hand reserved } }"}'

assert "business admin reads all orders"      allow "$ADA"  '{"query":"{ orders(limit:1){ id customer_id } }"}'
assert "business admin reads stock levels"    allow "$ADA"  '{"query":"{ stock_items(limit:1){ on_hand reserved } }"}'

# The core of the fix: no browser role may write order state directly. Status
# changes exist only behind the transitionOrder Action.
for who in CARA OTTO ADA; do
  assert "$who cannot insert an order row"    deny  "${!who}" '{"query":"mutation{ insert_orders_one(object:{customer_id:\"33333333-3333-3333-3333-333333333333\",status:\"DELIVERED\",total_cents:1}){ id } }"}'
  assert "$who cannot update order status"    deny  "${!who}" '{"query":"mutation{ update_orders(where:{}, _set:{status:\"DELIVERED\"}){ affected_rows } }"}'
  assert "$who cannot write stock directly"   deny  "${!who}" '{"query":"mutation{ update_stock_items(where:{}, _set:{on_hand:9999}){ affected_rows } }"}'
  assert "$who cannot read idempotency keys"  deny  "${!who}" '{"query":"{ idempotency_keys{ key } }"}'
done

echo
if [ "$fail" -gt 0 ]; then
  echo "Authorization matrix: $pass passed, $fail FAILED"
  exit 1
fi
echo "Authorization matrix: $pass passed, 0 failed"
