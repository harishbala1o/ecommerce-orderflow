# M1 — Monorepo Foundation + Domain State Machine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Ecommerce OrderFlow monorepo and build the framework-agnostic order **state machine** with an exhaustive test suite — the correctness core every later milestone depends on.

**Architecture:** pnpm-workspaces + Turborepo monorepo. A `packages/config` package owns zod-validated environment loading. A `packages/domain` package owns the order status model, the role model, the transition table, typed domain errors, and a pure `applyTransition` function. No frameworks, no I/O — just tested logic.

**Tech Stack:** TypeScript 5.x, Node 22 LTS, pnpm 9, Turborepo, Vitest, zod, ESLint (flat config).

## Global Constraints

- **TypeScript everywhere.** `strict: true`. No `any` in committed code.
- **Monorepo:** pnpm workspaces + Turborepo. Packages under `packages/*`, apps under `apps/*`.
- **TDD:** write the failing test first, watch it fail, implement minimally, watch it pass, commit.
- **Commits:** authored as `Harish Balaji <36741511+harishbala1o@users.noreply.github.com>` (already set as repo-local git identity). **Never** add a `Co-Authored-By` trailer or any mention of Claude/AI.
- **Domain purity:** `packages/domain` must have zero runtime dependencies except `zod` (types only where needed) and must not import Node/framework APIs. Ownership checks (is this customer the order's owner?) are a *service* concern, NOT a domain concern — the domain gates on `role` + `status` only.
- Node engine pinned via `.nvmrc` and `package.json#engines`.

---

### Task 1: Monorepo scaffold + tooling

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `.editorconfig`
- Create: `eslint.config.mjs`

**Interfaces:**
- Produces: workspace globs `packages/*`, `apps/*`; a base tsconfig extended by every package at `../../tsconfig.base.json`; root scripts `pnpm lint`, `pnpm test`, `pnpm typecheck`, `pnpm build` delegating to Turborepo.

- [ ] **Step 1: Create `.nvmrc`**

```
22
```

- [ ] **Step 2: Create `.gitignore`**

```gitignore
node_modules/
dist/
coverage/
*.tsbuildinfo
.turbo/
.env
.env.local
.DS_Store
```

- [ ] **Step 3: Create `.editorconfig`**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

- [ ] **Step 4: Create root `package.json`**

```json
{
  "name": "ecommerce-orderflow",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "turbo run build",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck"
  },
  "devDependencies": {
    "@types/node": "^22.7.0",
    "eslint": "^9.12.0",
    "typescript": "^5.6.0",
    "typescript-eslint": "^8.8.0",
    "turbo": "^2.1.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 5: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

- [ ] **Step 6: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "test": { "dependsOn": ["^build"] },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

- [ ] **Step 7: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "declaration": true,
    "sourceMap": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 8: Create `eslint.config.mjs`**

```js
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": "off"
    }
  },
  { ignores: ["**/dist/**", "**/coverage/**", "**/.turbo/**"] }
);
```

- [ ] **Step 9: Install and verify**

Run: `cd /Users/hasura/ecommerce-orderflow && pnpm install`
Expected: completes, creates `pnpm-lock.yaml`, no errors.

Run: `pnpm exec turbo --version`
Expected: prints a 2.x version.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm + turborepo monorepo"
```

---

### Task 2: `packages/config` — validated environment loader

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig.json`
- Create: `packages/config/vitest.config.ts`
- Create: `packages/config/src/env.ts`
- Create: `packages/config/src/index.ts`
- Test: `packages/config/src/env.test.ts`

**Interfaces:**
- Produces: `loadEnv(source?: Record<string, string | undefined>): Env` — parses+validates env, throws a readable error listing all invalid keys on failure. `Env` type has `NODE_ENV: 'development' | 'test' | 'production'` and `LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error'` (defaults `info`). Later packages import `{ loadEnv, type Env }` from `@ecommerce-orderflow/config`.

- [ ] **Step 1: Create `packages/config/package.json`**

```json
{
  "name": "@ecommerce-orderflow/config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "build": "tsc"
  },
  "dependencies": { "zod": "^3.23.0" }
}
```

- [ ] **Step 2: Create `packages/config/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/config/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 4: Write the failing test — `packages/config/src/env.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("parses a valid environment with defaults applied", () => {
    const env = loadEnv({ NODE_ENV: "development" });
    expect(env.NODE_ENV).toBe("development");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("accepts an explicit LOG_LEVEL", () => {
    const env = loadEnv({ NODE_ENV: "test", LOG_LEVEL: "debug" });
    expect(env.LOG_LEVEL).toBe("debug");
  });

  it("throws a readable error for an invalid NODE_ENV", () => {
    expect(() => loadEnv({ NODE_ENV: "staging" })).toThrowError(/NODE_ENV/);
  });

  it("throws for an invalid LOG_LEVEL", () => {
    expect(() => loadEnv({ NODE_ENV: "test", LOG_LEVEL: "loud" })).toThrowError(/LOG_LEVEL/);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @ecommerce-orderflow/config test`
Expected: FAIL — cannot resolve `./env.js` / `loadEnv` is not defined.

- [ ] **Step 6: Implement `packages/config/src/env.ts`**

```ts
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
```

- [ ] **Step 7: Implement `packages/config/src/index.ts`**

```ts
export { loadEnv, type Env } from "./env.js";
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @ecommerce-orderflow/config test`
Expected: PASS — 4 tests green.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(config): add zod-validated environment loader"
```

---

### Task 3: `packages/domain` — status & role models + typed errors

**Files:**
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/vitest.config.ts`
- Create: `packages/domain/src/order-status.ts`
- Create: `packages/domain/src/roles.ts`
- Create: `packages/domain/src/errors.ts`
- Test: `packages/domain/src/order-status.test.ts`

**Interfaces:**
- Produces:
  - `OrderStatus` = `'PENDING' | 'CONFIRMED' | 'PACKED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED'`; `ORDER_STATUSES` readonly tuple; `isTerminal(s: OrderStatus): boolean`.
  - `Role` = `'customer' | 'ops' | 'admin'`; `ROLES` readonly tuple.
  - Error classes `DomainError`, `IllegalTransitionError(from, action)`, `ForbiddenTransitionError(role, action, from)`.

- [ ] **Step 1: Create `packages/domain/package.json`**

```json
{
  "name": "@ecommerce-orderflow/domain",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:cov": "vitest run --coverage",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "build": "tsc"
  }
}
```

- [ ] **Step 2: Create `packages/domain/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/domain/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 4: Write the failing test — `packages/domain/src/order-status.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { ORDER_STATUSES, isTerminal } from "./order-status.js";

describe("order status", () => {
  it("declares all seven statuses", () => {
    expect(ORDER_STATUSES).toEqual([
      "PENDING", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED",
    ]);
  });

  it("marks DELIVERED, CANCELLED, RETURNED as terminal", () => {
    expect(isTerminal("DELIVERED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("RETURNED")).toBe(true);
  });

  it("marks in-flight statuses as non-terminal", () => {
    expect(isTerminal("PENDING")).toBe(false);
    expect(isTerminal("CONFIRMED")).toBe(false);
    expect(isTerminal("PACKED")).toBe(false);
    expect(isTerminal("SHIPPED")).toBe(false);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @ecommerce-orderflow/domain test`
Expected: FAIL — cannot resolve `./order-status.js`.

- [ ] **Step 6: Implement `packages/domain/src/order-status.ts`**

```ts
export const ORDER_STATUSES = [
  "PENDING", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set(["DELIVERED", "CANCELLED", "RETURNED"]);

export function isTerminal(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
```

- [ ] **Step 7: Implement `packages/domain/src/roles.ts`**

```ts
export const ROLES = ["customer", "ops", "admin"] as const;

export type Role = (typeof ROLES)[number];
```

- [ ] **Step 8: Implement `packages/domain/src/errors.ts`**

```ts
import type { OrderStatus } from "./order-status.js";
import type { Role } from "./roles.js";
import type { OrderAction } from "./transitions.js";

export class DomainError extends Error {}

export class IllegalTransitionError extends DomainError {
  constructor(public readonly from: OrderStatus, public readonly action: OrderAction) {
    super(`Illegal transition: cannot '${action}' from '${from}'`);
    this.name = "IllegalTransitionError";
  }
}

export class ForbiddenTransitionError extends DomainError {
  constructor(
    public readonly role: Role,
    public readonly action: OrderAction,
    public readonly from: OrderStatus,
  ) {
    super(`Role '${role}' may not '${action}' from '${from}'`);
    this.name = "ForbiddenTransitionError";
  }
}
```

> Note: `errors.ts` imports the `OrderAction` type from `transitions.js` (created in Task 4). The type-only import compiles once Task 4 lands; this task's test does not exercise `errors.ts`, so run its test in isolation as written.

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm --filter @ecommerce-orderflow/domain test order-status`
Expected: PASS — 3 tests green.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(domain): add order status, role models, and typed errors"
```

---

### Task 4: `packages/domain` — transition table + `canTransition`

**Files:**
- Create: `packages/domain/src/transitions.ts`
- Test: `packages/domain/src/transitions.test.ts`

**Interfaces:**
- Consumes: `OrderStatus` from `./order-status.js`, `Role` from `./roles.js`.
- Produces:
  - `OrderAction` = `'confirm' | 'pack' | 'ship' | 'deliver' | 'cancel' | 'return'`.
  - `TransitionRule` interface `{ action: OrderAction; from: OrderStatus; to: OrderStatus; allowedRoles: readonly Role[] }`.
  - `TRANSITIONS: readonly TransitionRule[]`.
  - `findRule(from: OrderStatus, action: OrderAction): TransitionRule | undefined`.
  - `canTransition(from: OrderStatus, action: OrderAction): boolean`.

- [ ] **Step 1: Write the failing test — `packages/domain/src/transitions.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { TRANSITIONS, findRule, canTransition } from "./transitions.js";

describe("transition table", () => {
  it("defines the happy-path chain", () => {
    expect(findRule("PENDING", "confirm")?.to).toBe("CONFIRMED");
    expect(findRule("CONFIRMED", "pack")?.to).toBe("PACKED");
    expect(findRule("PACKED", "ship")?.to).toBe("SHIPPED");
    expect(findRule("SHIPPED", "deliver")?.to).toBe("DELIVERED");
    expect(findRule("DELIVERED", "return")?.to).toBe("RETURNED");
  });

  it("allows cancel from PENDING, CONFIRMED, PACKED, and SHIPPED", () => {
    expect(canTransition("PENDING", "cancel")).toBe(true);
    expect(canTransition("CONFIRMED", "cancel")).toBe(true);
    expect(canTransition("PACKED", "cancel")).toBe(true);
    expect(canTransition("SHIPPED", "cancel")).toBe(true);
  });

  it("rejects transitions out of terminal states", () => {
    expect(canTransition("DELIVERED", "ship")).toBe(false);
    expect(canTransition("CANCELLED", "confirm")).toBe(false);
    expect(canTransition("RETURNED", "return")).toBe(false);
  });

  it("rejects skipping steps", () => {
    expect(canTransition("PENDING", "ship")).toBe(false);
    expect(canTransition("CONFIRMED", "deliver")).toBe(false);
  });

  it("restricts force-cancel of a SHIPPED order to admin only", () => {
    expect(findRule("SHIPPED", "cancel")?.allowedRoles).toEqual(["admin"]);
  });

  it("lets a customer cancel only from PENDING", () => {
    expect(findRule("PENDING", "cancel")?.allowedRoles).toContain("customer");
    expect(findRule("CONFIRMED", "cancel")?.allowedRoles).not.toContain("customer");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ecommerce-orderflow/domain test transitions`
Expected: FAIL — cannot resolve `./transitions.js`.

- [ ] **Step 3: Implement `packages/domain/src/transitions.ts`**

```ts
import type { OrderStatus } from "./order-status.js";
import type { Role } from "./roles.js";

export type OrderAction = "confirm" | "pack" | "ship" | "deliver" | "cancel" | "return";

export interface TransitionRule {
  readonly action: OrderAction;
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  readonly allowedRoles: readonly Role[];
}

export const TRANSITIONS: readonly TransitionRule[] = [
  { action: "confirm", from: "PENDING", to: "CONFIRMED", allowedRoles: ["ops", "admin"] },
  { action: "pack", from: "CONFIRMED", to: "PACKED", allowedRoles: ["ops", "admin"] },
  { action: "ship", from: "PACKED", to: "SHIPPED", allowedRoles: ["ops", "admin"] },
  { action: "deliver", from: "SHIPPED", to: "DELIVERED", allowedRoles: ["ops", "admin"] },
  { action: "cancel", from: "PENDING", to: "CANCELLED", allowedRoles: ["customer", "ops", "admin"] },
  { action: "cancel", from: "CONFIRMED", to: "CANCELLED", allowedRoles: ["ops", "admin"] },
  { action: "cancel", from: "PACKED", to: "CANCELLED", allowedRoles: ["ops", "admin"] },
  { action: "cancel", from: "SHIPPED", to: "CANCELLED", allowedRoles: ["admin"] },
  { action: "return", from: "DELIVERED", to: "RETURNED", allowedRoles: ["ops", "admin"] },
];

export function findRule(from: OrderStatus, action: OrderAction): TransitionRule | undefined {
  return TRANSITIONS.find((rule) => rule.from === from && rule.action === action);
}

export function canTransition(from: OrderStatus, action: OrderAction): boolean {
  return findRule(from, action) !== undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @ecommerce-orderflow/domain test transitions`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(domain): add order transition table and guards"
```

---

### Task 5: `packages/domain` — `applyTransition` orchestrator + barrel export

**Files:**
- Create: `packages/domain/src/state-machine.ts`
- Create: `packages/domain/src/index.ts`
- Test: `packages/domain/src/state-machine.test.ts`

**Interfaces:**
- Consumes: `findRule` from `./transitions.js`; `IllegalTransitionError`, `ForbiddenTransitionError` from `./errors.js`; `OrderStatus`, `Role`, `OrderAction`.
- Produces:
  - `TransitionInput` `{ current: OrderStatus; action: OrderAction; role: Role }`.
  - `TransitionResult` `{ from: OrderStatus; to: OrderStatus; action: OrderAction }`.
  - `applyTransition(input: TransitionInput): TransitionResult` — throws `IllegalTransitionError` when no rule exists, `ForbiddenTransitionError` when the role is not permitted.
  - `packages/domain/src/index.ts` re-exports everything the service layer needs.

- [ ] **Step 1: Write the failing test — `packages/domain/src/state-machine.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { applyTransition } from "./state-machine.js";
import { IllegalTransitionError, ForbiddenTransitionError } from "./errors.js";

describe("applyTransition", () => {
  it("advances a valid transition for a permitted role", () => {
    const result = applyTransition({ current: "PENDING", action: "confirm", role: "ops" });
    expect(result).toEqual({ from: "PENDING", to: "CONFIRMED", action: "confirm" });
  });

  it("lets a customer cancel their PENDING order", () => {
    const result = applyTransition({ current: "PENDING", action: "cancel", role: "customer" });
    expect(result.to).toBe("CANCELLED");
  });

  it("throws IllegalTransitionError when no rule exists", () => {
    expect(() => applyTransition({ current: "DELIVERED", action: "ship", role: "admin" }))
      .toThrow(IllegalTransitionError);
  });

  it("throws ForbiddenTransitionError when the role is not permitted", () => {
    expect(() => applyTransition({ current: "PENDING", action: "confirm", role: "customer" }))
      .toThrow(ForbiddenTransitionError);
  });

  it("forbids a customer cancelling a CONFIRMED order", () => {
    expect(() => applyTransition({ current: "CONFIRMED", action: "cancel", role: "customer" }))
      .toThrow(ForbiddenTransitionError);
  });

  it("allows admin force-cancel of a SHIPPED order", () => {
    expect(applyTransition({ current: "SHIPPED", action: "cancel", role: "admin" }).to)
      .toBe("CANCELLED");
  });

  it("forbids ops force-cancel of a SHIPPED order", () => {
    expect(() => applyTransition({ current: "SHIPPED", action: "cancel", role: "ops" }))
      .toThrow(ForbiddenTransitionError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @ecommerce-orderflow/domain test state-machine`
Expected: FAIL — cannot resolve `./state-machine.js`.

- [ ] **Step 3: Implement `packages/domain/src/state-machine.ts`**

```ts
import type { OrderStatus } from "./order-status.js";
import type { Role } from "./roles.js";
import { type OrderAction, findRule } from "./transitions.js";
import { IllegalTransitionError, ForbiddenTransitionError } from "./errors.js";

export interface TransitionInput {
  readonly current: OrderStatus;
  readonly action: OrderAction;
  readonly role: Role;
}

export interface TransitionResult {
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  readonly action: OrderAction;
}

export function applyTransition({ current, action, role }: TransitionInput): TransitionResult {
  const rule = findRule(current, action);
  if (!rule) {
    throw new IllegalTransitionError(current, action);
  }
  if (!rule.allowedRoles.includes(role)) {
    throw new ForbiddenTransitionError(role, action, current);
  }
  return { from: current, to: rule.to, action };
}
```

- [ ] **Step 4: Implement `packages/domain/src/index.ts`**

```ts
export { ORDER_STATUSES, isTerminal, type OrderStatus } from "./order-status.js";
export { ROLES, type Role } from "./roles.js";
export {
  TRANSITIONS,
  findRule,
  canTransition,
  type OrderAction,
  type TransitionRule,
} from "./transitions.js";
export {
  applyTransition,
  type TransitionInput,
  type TransitionResult,
} from "./state-machine.js";
export {
  DomainError,
  IllegalTransitionError,
  ForbiddenTransitionError,
} from "./errors.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @ecommerce-orderflow/domain test state-machine`
Expected: PASS — 7 tests green.

- [ ] **Step 6: Run the whole domain suite + typecheck**

Run: `pnpm --filter @ecommerce-orderflow/domain test && pnpm --filter @ecommerce-orderflow/domain typecheck`
Expected: all domain tests green; `tsc --noEmit` reports no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(domain): add applyTransition orchestrator and public API"
```

---

### Task 6: Repo-wide verification gate

**Files:**
- Modify: `README.md` (create if absent) — a short "Milestone 1" section.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a green `pnpm lint && pnpm typecheck && pnpm test` at the repo root.

- [ ] **Step 1: Create `README.md`**

```markdown
# Ecommerce OrderFlow

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
```

- [ ] **Step 2: Run the full root gate**

Run: `cd /Users/hasura/ecommerce-orderflow && pnpm lint && pnpm typecheck && pnpm test`
Expected: Turborepo runs lint, typecheck, and test across `@ecommerce-orderflow/config` and `@ecommerce-orderflow/domain`; all green.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: add README with M1 status and dev instructions"
```

---

## Self-Review

**Spec coverage (M1 scope only):**
- Order state machine with all 7 statuses + terminal set → Tasks 3–5. ✅
- Role model (customer/ops/admin) + role-gated transitions → Tasks 3–5. ✅
- Typed domain errors (`IllegalTransitionError`, `ForbiddenTransitionError`) → Task 3, exercised in Task 5. ✅
- Exhaustive state-machine tests (legal, illegal, role gates) → Tasks 4–5. ✅
- Monorepo (pnpm + Turborepo) + validated config → Tasks 1–2. ✅
- Deferred by design to later milestones: Postgres/Hasura (M2), NestJS service (M3), Keycloak/dashboard (M4), observability/CI/k8s (M5). ✅

**Placeholder scan:** No TBD/TODO; every code step contains complete code; every run step has an exact command + expected result. The one forward-reference (`errors.ts` → `OrderAction` from Task 4) is explicitly called out with a note. ✅

**Type consistency:** `OrderStatus`, `Role`, `OrderAction`, `TransitionRule`, `TransitionInput`, `TransitionResult`, `applyTransition`, `findRule`, `canTransition`, `isTerminal`, `loadEnv`/`Env` are named identically across the tasks that define and consume them. ✅
