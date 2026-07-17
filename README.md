# OrderFlow

An e-commerce **order management** platform, built from scratch to demonstrate
backend, DevOps, cloud, and observability engineering. See the design spec in
[`docs/superpowers/specs/`](docs/superpowers/specs/).

## Status

- **M1 — Monorepo foundation + domain state machine** ✅
- **M2 — Data layer (Postgres + Hasura)** ✅

## Development

Requires Node 22 and pnpm 9.

```bash
pnpm install
pnpm test        # run all package tests
pnpm typecheck   # type-check every package
pnpm lint        # lint every package
```

## Run the data layer

Requires Docker. Brings up Postgres + Hasura, auto-applies versioned migrations
and metadata, seeds sample data, and serves GraphQL.

```bash
make up      # start Postgres + Hasura (migrations + metadata applied on boot)
make seed    # load sample users, products, and an order
make smoke   # verify the GraphQL API returns the seeded data with relationships
make down    # stop; `make reset` also drops the data volume
```

- GraphQL endpoint: `http://localhost:8080/v1/graphql`
- Console: `http://localhost:8080/console`

> **First-boot note:** the `cli-migrations-v3` image applies metadata before
> migrations on its throwaway bootstrap server, so the *first* `make up` logs
> transient `Inconsistent Metadata!` warnings. The normal-mode server reconciles
> once the tables exist (`is_consistent: true`), and subsequent restarts boot
> clean. This is expected, not an error.

## Packages

- `packages/domain` — framework-agnostic order state machine (the correctness core).
- `packages/config` — zod-validated environment loading.

## Layout

- `hasura/` — versioned migrations, metadata, and seeds (applied in CI, never by hand).
- `infra/docker/` — Docker Compose stack and smoke test.
