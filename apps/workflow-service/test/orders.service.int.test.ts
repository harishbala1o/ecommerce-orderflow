import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { Pool } from "pg";
import {
  IllegalTransitionError,
  ForbiddenTransitionError,
  InsufficientStockError,
} from "@ecommerce-orderflow/domain";
import { OrderRepository } from "../src/db/order.repository.js";
import {
  IdempotencyConflictError,
  VersionConflictError,
} from "../src/orders/errors.js";
import { OrdersService } from "../src/orders/orders.service.js";
import { MetricsService } from "../src/observability/metrics.service.js";
import type { InventoryClient } from "../src/inventory/inventory.client.js";
import type { Session } from "../src/orders/dto.js";

// Testcontainers' resource reaper is unnecessary here and can be flaky in CI.
process.env.TESTCONTAINERS_RYUK_DISABLED = "true";

/**
 * Applies every migration in order, rather than a hand-maintained list that
 * silently goes stale the next time one is added.
 */
function applyAllMigrations(): string {
  const dir = fileURLToPath(new URL("../../../hasura/migrations/default", import.meta.url));
  return readdirSync(dir)
    .filter((d) => /^\d+_/.test(d))
    .sort()
    .map((d) => readFileSync(`${dir}/${d}/up.sql`, "utf8"))
    .join("\n");
}

const CUSTOMER = "33333333-3333-3333-3333-333333333333";
const OTHER_CUSTOMER = "44444444-4444-4444-4444-444444444444";
const P1 = "aaaaaaaa-0000-0000-0000-000000000001";
const P2 = "aaaaaaaa-0000-0000-0000-000000000002";

const customerSession = (userId = CUSTOMER): Session => ({ role: "customer", userId });
const opsSession: Session = { role: "ops", userId: "22222222-2222-2222-2222-222222222222" };

let container: StartedTestContainer;
let pool: Pool;
let repo: OrderRepository;
let service: OrdersService;

/**
 * Stock now lives in a separate service with its own database, so these tests
 * stub the inventory client. What is under test here is the *saga behaviour* of
 * the order service: that stock is held before the order row is created, and
 * that a local failure triggers a compensating release. The inventory service's
 * own transactional correctness is tested in its own integration suite.
 */
const inventory = {
  reserve: vi.fn<InventoryClient["reserve"]>(),
  confirm: vi.fn<InventoryClient["confirm"]>(),
  releaseQuietly: vi.fn<InventoryClient["releaseQuietly"]>(),
};

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

  await pool.query(applyAllMigrations());
  await pool.query(
    `insert into users (id, email, display_name, role) values
       ($1,'c@x.dev','Cara','customer'),
       ($2,'o@x.dev','Otto','ops'),
       ($3,'c2@x.dev','Carl','customer')`,
    [CUSTOMER, opsSession.userId, OTHER_CUSTOMER],
  );
  await pool.query(
    `insert into products (id, sku, name, unit_price_cents) values
       ($1,'P1','Widget',1000),
       ($2,'P2','Gadget',500)`,
    [P1, P2],
  );

  repo = new OrderRepository(pool);
  service = new OrdersService(repo, new MetricsService(), inventory as unknown as InventoryClient);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

beforeEach(() => {
  inventory.reserve.mockReset().mockResolvedValue(undefined);
  inventory.confirm.mockReset().mockResolvedValue(undefined);
  inventory.releaseQuietly.mockReset().mockResolvedValue(undefined);
});

async function statusOf(id: string): Promise<string> {
  const { rows } = await pool.query<{ status: string }>("select status from orders where id=$1", [id]);
  return rows[0]!.status;
}
async function eventCount(id: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>("select count(*)::int as n from order_events where order_id=$1", [id]);
  return Number(rows[0]!.n);
}
async function orderExists(id: string): Promise<boolean> {
  const { rows } = await pool.query("select 1 from orders where id=$1", [id]);
  return rows.length > 0;
}

describe("OrdersService placement saga (integration)", () => {
  it("places an order as PENDING with the correct total and an audit event", async () => {
    const { id, status } = await service.placeOrder(customerSession(), {
      items: [{ productId: P1, quantity: 2 }],
    });
    expect(status).toBe("PENDING");
    const { rows } = await pool.query<{ total_cents: number }>(
      "select total_cents from orders where id=$1",
      [id],
    );
    expect(rows[0]!.total_cents).toBe(2000);
    expect(await eventCount(id)).toBe(1);
  });

  it("holds stock before creating the order, then confirms the hold", async () => {
    const { id } = await service.placeOrder(customerSession(), {
      items: [{ productId: P1, quantity: 2 }],
    });
    // Reserved against the id the order was then created with.
    expect(inventory.reserve).toHaveBeenCalledWith(id, [{ productId: P1, quantity: 2 }]);
    expect(inventory.confirm).toHaveBeenCalledWith(id);
    expect(inventory.releaseQuietly).not.toHaveBeenCalled();
  });

  it("creates no order when stock is unavailable", async () => {
    inventory.reserve.mockRejectedValueOnce(new InsufficientStockError(P2, 5, 1));
    await expect(
      service.placeOrder(customerSession(), { items: [{ productId: P2, quantity: 5 }] }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    const { rows } = await pool.query("select 1 from orders where total_cents = 2500");
    expect(rows).toHaveLength(0);
    expect(inventory.confirm).not.toHaveBeenCalled();
  });

  it("releases the hold when the local order write fails (compensation)", async () => {
    // An unknown customer violates the foreign key, so the local transaction fails
    // after the reservation has already succeeded.
    const orphan: Session = { role: "customer", userId: "55555555-5555-5555-5555-555555555555" };
    await expect(
      service.placeOrder(orphan, { items: [{ productId: P1, quantity: 1 }] }),
    ).rejects.toThrow();

    expect(inventory.reserve).toHaveBeenCalledTimes(1);
    expect(inventory.releaseQuietly).toHaveBeenCalledTimes(1);
    // Compensated against the same id that was reserved.
    const reservedId = inventory.reserve.mock.calls[0]![0];
    expect(inventory.releaseQuietly).toHaveBeenCalledWith(reservedId);
    expect(await orderExists(reservedId)).toBe(false);
    expect(inventory.confirm).not.toHaveBeenCalled();
  });

  it("rejects an unknown product before any stock is held", async () => {
    await expect(
      service.placeOrder(customerSession(), {
        items: [{ productId: "aaaaaaaa-0000-0000-0000-0000000000ff", quantity: 1 }],
      }),
    ).rejects.toThrow(/Unknown product/);
    expect(inventory.reserve).not.toHaveBeenCalled();
  });
});

describe("OrdersService transitions (integration)", () => {
  it("advances the full lifecycle as ops without touching stock directly", async () => {
    const { id } = await service.placeOrder(customerSession(), {
      items: [{ productId: P1, quantity: 2 }],
    });
    for (const [action, expected] of [
      ["confirm", "CONFIRMED"],
      ["pack", "PACKED"],
      ["ship", "SHIPPED"],
      ["deliver", "DELIVERED"],
    ] as const) {
      expect((await service.transitionOrder(opsSession, { orderId: id, action })).status).toBe(
        expected,
      );
    }
    // create + 4 transitions
    expect(await eventCount(id)).toBe(5);
  });

  it("lets a customer cancel their own PENDING order", async () => {
    const { id } = await service.placeOrder(customerSession(), {
      items: [{ productId: P1, quantity: 1 }],
    });
    expect(
      (await service.transitionOrder(customerSession(), { orderId: id, action: "cancel" })).status,
    ).toBe("CANCELLED");
  });

  it("forbids a customer from cancelling someone else's order", async () => {
    const { id } = await service.placeOrder(customerSession(), {
      items: [{ productId: P1, quantity: 1 }],
    });
    await expect(
      service.transitionOrder(customerSession(OTHER_CUSTOMER), { orderId: id, action: "cancel" }),
    ).rejects.toBeInstanceOf(ForbiddenTransitionError);
    expect(await statusOf(id)).toBe("PENDING"); // unchanged
  });

  it("rejects an illegal transition and leaves the order untouched", async () => {
    const { id } = await service.placeOrder(customerSession(), {
      items: [{ productId: P1, quantity: 1 }],
    });
    await expect(
      service.transitionOrder(opsSession, { orderId: id, action: "ship" }),
    ).rejects.toBeInstanceOf(IllegalTransitionError);
    expect(await statusOf(id)).toBe("PENDING");
  });
});

describe("placement idempotency", () => {
  it("replays the original order instead of placing a second one", async () => {
    const key = "retry-key-aaaaaaaa";
    const items = [{ productId: P1, quantity: 1 }] as const;

    const first = await service.placeOrder(customerSession(), {
      items: [...items],
      idempotencyKey: key,
    });
    // The client never saw the response and retries the identical request.
    const second = await service.placeOrder(customerSession(), {
      items: [...items],
      idempotencyKey: key,
    });

    expect(second.id).toBe(first.id);
    // Exactly one order, and stock was held exactly once.
    const { rows } = await pool.query("select 1 from orders where id = $1", [first.id]);
    expect(rows).toHaveLength(1);
    expect(inventory.reserve).toHaveBeenCalledTimes(1);
  });

  it("rejects the same key carrying a different payload", async () => {
    const key = "reused-key-bbbbbbbb";
    await service.placeOrder(customerSession(), {
      items: [{ productId: P1, quantity: 1 }],
      idempotencyKey: key,
    });
    await expect(
      service.placeOrder(customerSession(), {
        items: [{ productId: P1, quantity: 9 }],
        idempotencyKey: key,
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
  });

  it("scopes keys per actor, so two customers may use the same key", async () => {
    const key = "shared-key-cccccccc";
    const a = await service.placeOrder(customerSession(), {
      items: [{ productId: P1, quantity: 1 }],
      idempotencyKey: key,
    });
    const b = await service.placeOrder(customerSession(OTHER_CUSTOMER), {
      items: [{ productId: P1, quantity: 1 }],
      idempotencyKey: key,
    });
    expect(b.id).not.toBe(a.id);
  });
});

describe("optimistic concurrency", () => {
  it("rejects a transition carrying a stale version and reports the current state", async () => {
    const { id } = await service.placeOrder(customerSession(), {
      items: [{ productId: P1, quantity: 1 }],
    });
    const placedVersion = (await pool.query<{ version: number }>(
      "select version from orders where id=$1",
      [id],
    )).rows[0]!.version;

    // Operator A confirms the order.
    await service.transitionOrder(opsSession, {
      orderId: id,
      action: "confirm",
      expectedVersion: placedVersion,
    });

    // Operator B was still looking at the pre-confirm version.
    await expect(
      service.transitionOrder(opsSession, {
        orderId: id,
        action: "pack",
        expectedVersion: placedVersion,
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);

    // The losing request changed nothing.
    expect(await statusOf(id)).toBe("CONFIRMED");
  });

  it("accepts a transition carrying the current version and returns the next one", async () => {
    const { id } = await service.placeOrder(customerSession(), {
      items: [{ productId: P1, quantity: 1 }],
    });
    const v = (await pool.query<{ version: number }>("select version from orders where id=$1", [id]))
      .rows[0]!.version;
    const result = await service.transitionOrder(opsSession, {
      orderId: id,
      action: "confirm",
      expectedVersion: v,
    });
    expect(result.version).toBe(v + 1);
  });

  it("still works for callers that do not send a version", async () => {
    const { id } = await service.placeOrder(customerSession(), {
      items: [{ productId: P1, quantity: 1 }],
    });
    await expect(
      service.transitionOrder(opsSession, { orderId: id, action: "confirm" }),
    ).resolves.toMatchObject({ status: "CONFIRMED" });
  });
});
