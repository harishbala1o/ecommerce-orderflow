import { test, expect, type Page } from "@playwright/test";

// Full order lifecycle through the real stack: Keycloak login, Hasura RBAC,
// Actions -> workflow service, audit timeline. Requires `make up` + seed.

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in" }).click();
  // Keycloak's hosted login form
  await page.locator("#username").fill(username);
  await page.locator("#password").fill("demo1234");
  await page.locator("#kc-login").click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  // Keycloak may ask to confirm when no id_token_hint is available
  const confirm = page.locator("#kc-logout");
  if (await confirm.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await confirm.click();
  }
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
}

test("customer places an order, ops fulfils it, customer sees the outcome", async ({ page }) => {
  // ---- Cara (customer) places an order ----
  await signIn(page, "cara");
  await page.goto("/new");
  await page.getByLabel("Quantity of Wireless Mouse").fill("2");
  await page.getByRole("button", { name: "Place order" }).click();

  await expect(page).toHaveURL(/\/orders\//);
  const orderUrl = page.url();
  await expect(page.getByTestId("status-badge").first()).toHaveText("PENDING");
  // A pending order is cancellable by its owner — and that is the only action
  await expect(page.getByRole("button", { name: "Cancel order" })).toBeVisible();
  await expect(page.getByTestId("order-actions").getByRole("button")).toHaveCount(1);
  await signOut(page);

  // ---- Otto (ops) drives it through fulfillment ----
  await signIn(page, "otto");
  await page.goto(orderUrl);
  for (const action of ["Confirm", "Pack", "Ship", "Mark delivered"]) {
    await page.getByRole("button", { name: action, exact: true }).click();
    // Wait for the refetched status to render before the next step
    await expect(page.getByTestId("order-actions").getByRole("button", { name: action })).toBeHidden();
  }
  await expect(page.getByTestId("status-badge").first()).toHaveText("DELIVERED");
  await signOut(page);

  // ---- Cara sees the outcome and the audit trail ----
  await signIn(page, "cara");
  await page.goto(orderUrl);
  await expect(page.getByTestId("status-badge").first()).toHaveText("DELIVERED");
  const timeline = page.getByTestId("order-timeline");
  await expect(timeline).toContainText("create", { ignoreCase: true });
  await expect(timeline).toContainText("deliver", { ignoreCase: true });
  // A customer gets no actions on a delivered order (return is ops/admin)
  await expect(page.getByTestId("order-actions")).toHaveCount(0);
  await signOut(page);
});

test("a customer cannot open another customer's order", async ({ page }) => {
  // Ada (admin) can see every order; grab one that is NOT Cara's
  await signIn(page, "ada");
  const otherOrder = page
    .getByTestId("orders-table")
    .locator("tr", { hasNot: page.getByText("Cara Customer") })
    .locator("a")
    .first();
  const href = await otherOrder.getAttribute("href");
  await signOut(page);

  await signIn(page, "cara");
  await page.goto(href!);
  // Hasura row-level permissions make the row invisible: not found, no leak
  await expect(page.getByText("Order not found")).toBeVisible();
  await signOut(page);
});
