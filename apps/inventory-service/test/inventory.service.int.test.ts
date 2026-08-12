import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { Pool } from "pg";
import { InventoryRepository } from "../src/db/inventory.repository.js";
import { InventoryService } from "../src/inventory/inventory.service.js";
import { MetricsService } from "../src/observability/metrics.service.js";
import { InsufficientStockError, UnknownStockItemError } from "../src/common/errors.js";
import type { ServiceConfig } from "../src/config/config.module.js";

process.env.TESTCONTAINERS_RYUK_DISABLED = "true";

const migration = readFileSync(
  fileURLToPath(
    new URL("../../../hasura/migrations/inventory/1720000000010_init/up.sql", import.meta.url),
  ),
  "utf8",
);

const P1 = "aaaaaaaa-0000-0000-0000-000000000001"; // 10 on hand, reorder level 3
const P2 = "aaaaaaaa-0000-0000-0000-000000000002"; // 2 on hand, reorder level 0

let container: StartedTestContainer;
let pool: Pool;
let repo: InventoryRepository;
let service: InventoryService;

const config = { RESERVATION_TTL_SECONDS: 300 } as ServiceConfig;

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

  await pool.query(migration);
  repo = new InventoryRepository(pool);
  service = new InventoryService(repo, new MetricsService(), config);
}, 120_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

beforeEach(async () => {
  await pool.query("delete from stock_movements");
  await pool.query("delete from stock_alerts");
  await pool.query("delete from reservations");
  await pool.query("delete from processed_events");
  await pool.query("delete from stock_items");
  await pool.query(
    `insert into stock_items (product_id, sku, on_hand, reserved, reorder_level, reorder_qty) values
       ($1, 'P1', 10, 0, 3, 20),
       ($2, 'P2', 2, 0, 0, 5)`,
    [P1, P2],
  );
});

async function levels(productId: string) {
  const { rows } = await pool.query<{ on_hand: number; reserved: number }>(
    "select on_hand, reserved from stock_items where product_id = $1",
    [productId],
  );
  return rows[0]!;
}
async function movementKinds(productId: string): Promise<string[]> {
  const { rows } = await pool.query<{ kind: string }>(
    "select kind from stock_movements where product_id = $1 order by created_at, kind",
    [productId],
  );
  return rows.map((r) => r.kind);
}
async function openAlert(productId: string) {
  const { rows } = await pool.query<{ level: string; suggested_qty: number }>(
    "select level, suggested_qty from stock_alerts where product_id = $1 and status = 'OPEN'",
    [productId],
  );
  return rows[0] ?? null;
}

describe("reserve", () => {
  it("holds stock without reducing what is physically present", async () => {
    await service.reserve({ orderId: randomUUID(), items: [{ productId: P1, quantity: 4 }] });
    expect(await levels(P1)).toEqual({ on_hand: 10, reserved: 4 });
    expect(await movementKinds(P1)).toEqual(["RESERVE"]);
  });

  it("rejects a quantity beyond availability and writes nothing", async () => {
    await service.reserve({ orderId: randomUUID(), items: [{ productId: P1, quantity: 8 }] });
    await expect(
      service.reserve({ orderId: randomUUID(), items: [{ productId: P1, quantity: 3 }] }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    // the failed attempt left the first hold untouched
    expect(await levels(P1)).toEqual({ on_hand: 10, reserved: 8 });
  });

  it("is atomic across lines: one bad line reserves nothing", async () => {
    await expect(
      service.reserve({
        orderId: randomUUID(),
        items: [
          { productId: P1, quantity: 1 },
          { productId: P2, quantity: 99 }, // only 2 available
        ],
      }),
    ).rejects.toBeInstanceOf(InsufficientStockError);
    expect(await levels(P1)).toEqual({ on_hand: 10, reserved: 0 });
    expect(await levels(P2)).toEqual({ on_hand: 2, reserved: 0 });
  });

  it("is idempotent: repeating the same reserve does not double-hold", async () => {
    const orderId = randomUUID();
    await service.reserve({ orderId, items: [{ productId: P1, quantity: 3 }] });
    await service.reserve({ orderId, items: [{ productId: P1, quantity: 3 }] });
    expect(await levels(P1)).toEqual({ on_hand: 10, reserved: 3 });
  });

  it("rejects an unknown product", async () => {
    await expect(
      service.reserve({ orderId: randomUUID(), items: [{ productId: randomUUID(), quantity: 1 }] }),
    ).rejects.toBeInstanceOf(UnknownStockItemError);
  });
});

describe("release and commit", () => {
  it("release gives the stock back", async () => {
    const orderId = randomUUID();
    await service.reserve({ orderId, items: [{ productId: P1, quantity: 4 }] });
    await service.release(orderId, "order cancelled");
    expect(await levels(P1)).toEqual({ on_hand: 10, reserved: 0 });
    expect(await movementKinds(P1)).toEqual(["RESERVE", "RELEASE"]);
  });

  it("commit removes the stock physically", async () => {
    const orderId = randomUUID();
    await service.reserve({ orderId, items: [{ productId: P1, quantity: 4 }] });
    await service.commit(orderId);
    expect(await levels(P1)).toEqual({ on_hand: 6, reserved: 0 });
    expect(await movementKinds(P1)).toEqual(["RESERVE", "COMMIT"]);
  });

  it("a replayed release changes nothing, because no holds remain", async () => {
    const orderId = randomUUID();
    await service.reserve({ orderId, items: [{ productId: P1, quantity: 4 }] });
    await service.release(orderId, "first");
    const after = await levels(P1);
    await service.release(orderId, "replay");
    expect(await levels(P1)).toEqual(after);
  });

  it("a replayed commit does not decrement twice", async () => {
    const orderId = randomUUID();
    await service.reserve({ orderId, items: [{ productId: P1, quantity: 4 }] });
    await service.commit(orderId);
    await service.commit(orderId);
    expect(await levels(P1)).toEqual({ on_hand: 6, reserved: 0 });
  });
});

describe("confirm and expiry", () => {
  it("confirming clears the expiry so the sweeper ignores the hold", async () => {
    const orderId = randomUUID();
    await service.reserve({ orderId, items: [{ productId: P1, quantity: 2 }] });
    const { confirmed } = await service.confirm(orderId);
    expect(confirmed).toBe(1);

    const expired = await repo.withTransaction((c) => repo.findExpiredOrderIds(c));
    expect(expired).not.toContain(orderId);
  });

  it("an unconfirmed hold becomes sweepable once its expiry passes", async () => {
    const orderId = randomUUID();
    await service.reserve({ orderId, items: [{ productId: P1, quantity: 2 }] });
    // simulate the TTL elapsing
    await pool.query("update reservations set expires_at = now() - interval '1 minute' where order_id = $1", [orderId]);

    const expired = await repo.withTransaction((c) => repo.findExpiredOrderIds(c));
    expect(expired).toContain(orderId);

    await service.release(orderId, "swept");
    expect(await levels(P1)).toEqual({ on_hand: 10, reserved: 0 });
  });
});

describe("alerts and reordering", () => {
  it("opens an OUT_OF_STOCK alert when availability reaches zero", async () => {
    await service.reserve({ orderId: randomUUID(), items: [{ productId: P2, quantity: 2 }] });
    expect(await openAlert(P2)).toMatchObject({ level: "OUT_OF_STOCK" });
  });

  it("opens a LOW alert at the reorder level and suggests a quantity", async () => {
    // P1: 10 on hand, reorder level 3. Reserving 7 leaves 3 available.
    await service.reserve({ orderId: randomUUID(), items: [{ productId: P1, quantity: 7 }] });
    expect(await openAlert(P1)).toMatchObject({ level: "LOW", suggested_qty: 20 });
  });

  it("keeps at most one open alert per product", async () => {
    await service.reserve({ orderId: randomUUID(), items: [{ productId: P1, quantity: 7 }] });
    await service.reserve({ orderId: randomUUID(), items: [{ productId: P1, quantity: 1 }] });
    const { rows } = await pool.query(
      "select 1 from stock_alerts where product_id = $1 and status = 'OPEN'",
      [P1],
    );
    expect(rows).toHaveLength(1);
  });

  it("receiving stock resolves the alert and raises what is on hand", async () => {
    await service.reserve({ orderId: randomUUID(), items: [{ productId: P2, quantity: 2 }] });
    expect(await openAlert(P2)).not.toBeNull();

    await service.receive({ productId: P2, quantity: 50, reason: "delivery" });
    expect((await levels(P2)).on_hand).toBe(52);
    expect(await openAlert(P2)).toBeNull();
    expect(await movementKinds(P2)).toEqual(["RESERVE", "RECEIVE"]);
  });

  it("no alert is opened while stock is healthy", async () => {
    await service.reserve({ orderId: randomUUID(), items: [{ productId: P1, quantity: 1 }] });
    expect(await openAlert(P1)).toBeNull();
  });
});

describe("concurrency", () => {
  it("two simultaneous reservations cannot oversell the same item", async () => {
    // 2 available; both orders want 2. Exactly one must win.
    const results = await Promise.allSettled([
      service.reserve({ orderId: randomUUID(), items: [{ productId: P2, quantity: 2 }] }),
      service.reserve({ orderId: randomUUID(), items: [{ productId: P2, quantity: 2 }] }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    expect(await levels(P2)).toEqual({ on_hand: 2, reserved: 2 });
  });
});
