# OrderFlow

An e-commerce **order management** platform, built from scratch to demonstrate
backend, DevOps, cloud, and observability engineering. See the design spec in
[`docs/superpowers/specs/`](docs/superpowers/specs/).

## Status

- **M1 — Monorepo foundation + domain state machine** ✅ (this milestone)

## Development

Requires Node 22 and pnpm 9.

```bash
pnpm install
pnpm test        # run all package tests
pnpm typecheck   # type-check every package
pnpm lint        # lint every package
```

## Packages

- `packages/domain` — framework-agnostic order state machine (the correctness core).
- `packages/config` — zod-validated environment loading.
