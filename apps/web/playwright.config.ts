import { defineConfig } from "@playwright/test";

/**
 * Runs against whichever stack E2E_BASE_URL points at.
 *
 * Default is the dev stack on :3000 (`make up` at the repo root). Set
 * E2E_BASE_URL=http://localhost:13000 to run against the isolated test stack,
 * with the dashboard started by `pnpm dev:test` and apps/web/.env.test.example copied to .env.local
 * in place.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const isTestStack = baseURL.includes("13000");

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1, // personas share Keycloak SSO state; run sequentially
  use: {
    baseURL,
    screenshot: "only-on-failure",
  },
  webServer: {
    command: isTestStack ? "pnpm dev:test" : "pnpm dev",
    url: `${baseURL}/login`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
