import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { Pool } from "pg";
import {
  IllegalTransitionError,
  ForbiddenTransitionError,
  InsufficientStockError,
} from "@ecommerce-orderflow/domain";
import { OrderRepository } from "../src/db/order.repository.js";
import { OrdersService } from "../src/orders/orders.service.js";
import type { Session } from "../src/orders/dto.js";

// Testcontainers' resource reaper is unnecessary here and can be flaky in CI.
process.env.TESTCONTAINERS_RYUK_DISABLED = "true";

const migration = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../hasura/migrations/default/${rel}`, import.meta.url)), "utf8");

const CUSTOMER = "33333333-3333-3333-3333-333333333333";
const OTHER_CUSTOMER = "44444444-4444-4444-4444-444444444444";
const P1 = "aaaaaaaa-0000-0000-0000-000000000001"; // stock 5
const P2 = "aaaaaaaa-0000-0000-0000-000000000002"; // stock 1

const customerSession = (userId = CUSTOMER): Session => ({ role: "customer", userId });
const opsSession: Session = { role: "ops", userId: "22222222-2222-2222-2222-222222222222" };

let container: StartedTestContainer;
let pool: Pool;
let repo: OrderRepository;
let service: OrdersService;

beforeAll(async () => {
  container = await new GenericContainer("postgres:16-alpine")
    .withEnvironment({ POSTGRES_USER: "test", POSTGRES_PASSWORD: "test", POSTGRES_DB: "test" })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();

  pool = new Pool({
    host: container.getHost(),
    port: container.getMappedPort(5432),
    user: "test",
    password: "test",
    database: "test",
  });

  await pool.query(migration("1720000000000_init/up.sql"));
  await pool.query(migration("1720000000002_processed_events/up.sql"));
  await pool.query(
    `insert into users (id, email, display_name, role) values
       ($1,'c@x.dev','Cara','customer'),
       ($2,'o@x.dev','Otto','ops'),
       ($3,'c2@x.dev','Carl','customer')`,
    [CUSTOMER, opsSession.userId, OTHER_CUSTOMER],
  );
  await pool.query(
    `insert into products (id, sku, name, unit_price_cents, stock_qty) values
       ($1,'P1','Widget',1000,5),
       ($2,'P2','Gadget',500,1)`,
    [P1, P2],
  );

  repo = new OrderRepository(pool);
  service = new OrdersService(repo);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

async function statusOf(id: string): Promise<string> {
  const { rows } = await pool.query<{ status: string }>("select status from orders where id=$1", [id]);
  return rows[0]!.status;
}
async function stockOf(id: string): Promise<number> {
  const { rows } = await pool.query<{ stock_qty: number }>("select stock_qty from products where id=$1", [id]);
  return rows[0]!.stock_qty;
}
async function eventCount(id: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>("select count(*)::int as n from order_events where order_id=$1", [id]);
  return Number(rows[0]!.n);
}

describe("OrdersService (integration)", () => {
  it("places an order as PENDING with the correct total and an audit event", async () => {
    const { id, status } = await service.placeOrder(customerSession(), { items: [{ productId: P1, quantity: 2 }] });
    expect(status).toBe("PENDING");
    const { rows } = await pool.query<{ total_cents: number }>("select total_cents from orders where id=$1", [id]);
    expect(rows[0]!.total_cents).toBe(2000);
    expect(await eventCount(id)).toBe(1);
  });

  it("advances the full lifecycle as ops and decrements stock on confirm", async () => {
    const { id } = await service.placeOrder(customerSession(), { items: [{ productId: P1, quantity: 2 }] });
    const before = await stockOf(P1);

    expect((await service.transitionOrder(opsSession, { orderId: id, action: "confirm" })).status).toBe("CONFIRMED");
    expect(await stockOf(P1)).toBe(before - 2);

    expect((await service.transitionOrder(opsSession, { orderId: id, action: "pack" })).status).toBe("PACKED");
    expect((await service.transitionOrder(opsSession, { orderId: id, action: "ship" })).status).toBe("SHIPPED");
    expect((await service.transitionOrder(opsSession, { orderId: id, action: "deliver" })).status).toBe("DELIVERED");
    // create + 4 transitions
    expect(await eventCount(id)).toBe(5);
  });

  it("lets a customer cancel their own PENDING order", async () => {
    const { id } = await service.placeOrder(customerSession(), { items: [{ productId: P1, quantity: 1 }] });
    expect((await service.transitionOrder(customerSession(), { orderId: id, action: "cancel" })).status).toBe("CANCELLED");
  });

  it("forbids a customer from cancelling someone else's order", async () => {
    const { id } = await service.placeOrder(customerSession(), { items: [{ productId: P1, quantity: 1 }] });
    await expect(
      service.transitionOrder(customerSession(OTHER_CUSTOMER), { orderId: id, action: "cancel" }),
    ).rejects.toBeInstanceOf(ForbiddenTransitionError);
    expect(await statusOf(id)).toBe("PENDING"); // unchanged
  });

  it("rejects an illegal transition and leaves the order untouched", async () => {
    const { id } = await service.placeOrder(customerSession(), { items: [{ productId: P1, quantity: 1 }] });
    await expect(
      service.transitionOrder(opsSession, { orderId: id, action: "ship" }),
    ).rejects.toBeInstanceOf(IllegalTransitionError);
    expect(await statusOf(id)).toBe("PENDING");
  });

  it("rolls back on insufficient stock at confirm (status + stock unchanged)", async () => {
    const { id } = await service.placeOrder(customerSession(), { items: [{ productId: P2, quantity: 2 }] });
    const stockBefore = await stockOf(P2);
    await expect(
      service.transitionOrder(opsSession, { orderId: id, action: "confirm" }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await statusOf(id)).toBe("PENDING");
    expect(await stockOf(P2)).toBe(stockBefore); // decrement rolled back
  });
});
