import { defineConfig } from "@playwright/test";

// Requires the backend stack to be up (`make up` at the repo root).
// The Next.js dev server is started automatically if not already running.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  workers: 1, // personas share Keycloak SSO state; run sequentially
  use: {
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
