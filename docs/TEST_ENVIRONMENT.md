# Isolated test environment

A second, fully separate stack used to develop and validate operator workflows. It runs
beside the dev stack without touching it.

## Why it is safe to run next to dev

| | dev | test |
|---|---|---|
| Compose project | `ecommerce-orderflow` | `orderflow-test` |
| Postgres | 5432 | **55432** |
| Hasura | 8080 | **18080** |
| Keycloak | 8081 | **18081** |
| Workflow service | 3001 | **13001** |
| Inventory service | 3002 | **13002** |
| Dashboard | 3000 | **13000** |
| Databases | `ecommerce_orderflow(_inventory)` | `orderflow_test(_inventory)` |
| Volume | `ecommerce-orderflow_pgdata` | `orderflow-test_pgdata` |
| Keycloak realm | `ecommerce-orderflow` | `orderflow-test` |

Because the Compose project name differs, the network and volume are separate, so
`make test-reset` can only ever drop the test volume. This was verified: the dev volume
survives a test reset.

## Commands

```bash
make test-env      # generate .env.test with random local-only secrets (gitignored)
make test-build    # build the service images for this stack
make test-up       # start, create the inventory database, and block until ready
make test-seed     # catalogue, stock levels, two customers with one order each
make test-ps       # what is running
make test-logs     # follow logs
make test-psql     # psql into the test order database
make test-down     # stop
make test-reset    # stop and drop ONLY the test volume
```

`make test-up` ends by running `infra/docker/test-ready.sh`, which waits for every service to
actually serve and then checks that Hasura metadata is consistent. A stack that merely
started produces misleading failures, so readiness is checked rather than assumed.

## Test identities

Realm `orderflow-test`, password `demo1234` for all three.

| User | Role | Purpose |
|---|---|---|
| `cara` | `customer` | Places orders, sees only her own |
| `otto` | `ops` | Fulfilment, reads all orders and stock |
| `ada` | `business_admin` | Elevated domain authority, explicitly permissioned |

`ada` is deliberately **not** Hasura's built-in `admin`. See
[ADR 0009](adr/0009-operator-safety-foundations.md).

Carl Customer exists in seed data with his own order but has no Keycloak identity, because
nothing signs in as him. His order exists so RBAC isolation can be asserted deterministically.

## Running the dashboard against it

```bash
cd apps/web
cp .env.test.local .env.local   # test stack ports and realm
pnpm dev:test                   # http://localhost:13000
```

`dev:test` builds into `.next-test` rather than `.next`. `next build` and `next dev`
otherwise share one directory, so running `pnpm build` while a dev server is up overwrites
the chunks it is serving and every route then fails with `MODULE_NOT_FOUND` until `.next` is
deleted. Separate directories make the two safe to run at the same time.

## Hasura console and admin secret

The console is at <http://localhost:18080/console>. It asks for the admin secret, which was
generated locally by `make test-env` and lives in the gitignored `.env.test`:

```bash
grep '^HASURA_GRAPHQL_ADMIN_SECRET=' .env.test | cut -d= -f2-
```

The dev stack's equivalent is at <http://localhost:8080/console>, with its secret in
`.env` (seeded from the committed, self-labelled dev default in `.env.example`).

> The admin secret is Hasura's unrestricted role. It bypasses every permission check, which
> is exactly why no browser session is issued it (see
> [ADR 0009](adr/0009-operator-safety-foundations.md)). Use it for console and tooling only.

## Running the checks

```bash
./infra/docker/test-permissions.sh                       # 21 authorization assertions
cd apps/web && E2E_BASE_URL=http://localhost:13000 pnpm exec playwright test
```

`test-permissions.sh` asserts the full role matrix against the live stack: what each role may
read, and that no browser role can write order state or stock directly. These are properties
of the deployed metadata plus the token mapping, so they cannot be covered by a unit test.

> On a cold stack the first Playwright run can time out while Next.js compiles and Keycloak
> warms up. Run it a second time before treating a failure as real.

## Upgrading an existing test stack

Migrations apply on Hasura boot. After pulling new migrations:

```bash
./infra/docker/test-compose.sh up -d --force-recreate hasura
```

Both paths are validated: a fresh volume, and an upgrade over a stack that already had data.
