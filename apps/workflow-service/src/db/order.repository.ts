import { Inject, Injectable } from "@nestjs/common";
import { Pool } from "pg";
import type { PoolClient } from "pg";
import type { OrderStatus } from "@ecommerce-orderflow/domain";
import { PG_POOL } from "./tokens.js";

type Executor = Pool | PoolClient;

export interface OrderRow {
  id: string;
  customer_id: string;
  status: OrderStatus;
  total_cents: number;
  /** Incremented on every transition; used for optimistic concurrency. */
  version: number;
}

export interface ProductRow {
  id: string;
  sku: string;
  unit_price_cents: number;
}

export interface OrderItemRow {
  product_id: string;
  quantity: number;
}

export interface OrderEventInsert {
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  action: string;
  actorId: string | null;
  actorRole: string | null;
  correlationId?: string | null;
  reason?: string | null;
}

const ORDER_COLUMNS = "id, customer_id, status, total_cents, version";
const PRODUCT_COLUMNS = "id, sku, unit_price_cents";

@Injectable()
export class OrderRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async getOrderById(id: string): Promise<OrderRow | null> {
    const { rows } = await this.pool.query<OrderRow>(
      `select ${ORDER_COLUMNS} from orders where id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async getOrderForUpdate(client: PoolClient, id: string): Promise<OrderRow | null> {
    const { rows } = await client.query<OrderRow>(
      `select ${ORDER_COLUMNS} from orders where id = $1 for update`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Advances status and bumps the version in one statement. */
  async updateStatus(client: PoolClient, id: string, status: OrderStatus): Promise<number> {
    const { rows } = await client.query<{ version: number }>(
      "update orders set status = $2, version = version + 1 where id = $1 returning version",
      [id, status],
    );
    return rows[0]!.version;
  }

  // --- idempotency -------------------------------------------------------

  /**
   * Claims an idempotency key, or reports what happened to an earlier claim.
   *
   * `in_progress` is a durable claim, never a success: a crashed attempt leaves
   * one behind and it is surfaced for recovery rather than replayed as though
   * it had completed.
   */
  async claimIdempotencyKey(
    client: PoolClient,
    operation: string,
    actorId: string,
    key: string,
    fingerprint: string,
  ): Promise<
    | { outcome: "claimed" }
    | { outcome: "replay"; response: unknown }
    | { outcome: "conflict" }
    | { outcome: "in_progress" }
  > {
    const { rows } = await client.query<{
      fingerprint: string;
      status: string;
      response: unknown;
    }>(
      `insert into idempotency_keys (operation, actor_id, key, fingerprint)
       values ($1, $2, $3, $4)
       on conflict (operation, actor_id, key) do nothing
       returning fingerprint, status, response`,
      [operation, actorId, key, fingerprint],
    );
    if (rows.length > 0) return { outcome: "claimed" };

    const existing = await client.query<{
      fingerprint: string;
      status: string;
      response: unknown;
    }>(
      `select fingerprint, status, response from idempotency_keys
       where operation = $1 and actor_id = $2 and key = $3`,
      [operation, actorId, key],
    );
    const row = existing.rows[0];
    if (!row) return { outcome: "claimed" };
    if (row.fingerprint !== fingerprint) return { outcome: "conflict" };
    if (row.status === "succeeded") return { outcome: "replay", response: row.response };
    if (row.status === "in_progress") return { outcome: "in_progress" };
    return { outcome: "claimed" }; // a previous attempt failed; allow a fresh try
  }

  async completeIdempotencyKey(
    client: PoolClient,
    operation: string,
    actorId: string,
    key: string,
    response: unknown,
  ): Promise<void> {
    await client.query(
      `update idempotency_keys set status = 'succeeded', response = $4
       where operation = $1 and actor_id = $2 and key = $3`,
      [operation, actorId, key, JSON.stringify(response)],
    );
  }

  async failIdempotencyKey(
    operation: string,
    actorId: string,
    key: string,
  ): Promise<void> {
    await this.pool.query(
      `update idempotency_keys set status = 'failed'
       where operation = $1 and actor_id = $2 and key = $3 and status = 'in_progress'`,
      [operation, actorId, key],
    );
  }

  async insertEvent(client: PoolClient, e: OrderEventInsert): Promise<void> {
    await client.query(
      `insert into order_events
         (order_id, from_status, to_status, action, actor_id, actor_role, correlation_id, reason)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        e.orderId,
        e.fromStatus,
        e.toStatus,
        e.action,
        e.actorId,
        e.actorRole,
        e.correlationId ?? null,
        e.reason ?? null,
      ],
    );
  }

  async findProducts(exec: Executor, ids: string[]): Promise<ProductRow[]> {
    const { rows } = await exec.query<ProductRow>(
      `select ${PRODUCT_COLUMNS} from products where id = any($1::uuid[])`,
      [ids],
    );
    return rows;
  }

  /**
   * The id is generated by the caller rather than the database, because stock is
   * reserved against it before this row exists.
   */
  async createOrder(
    client: PoolClient,
    customerId: string,
    totalCents: number,
    orderId: string,
  ): Promise<OrderRow> {
    const { rows } = await client.query<OrderRow>(
      `insert into orders (id, customer_id, status, total_cents)
       values ($1, $2, 'PENDING', $3)
       returning ${ORDER_COLUMNS}`,
      [orderId, customerId, totalCents],
    );
    const created = rows[0];
    if (!created) {
      throw new Error("createOrder: insert returned no row");
    }
    return created;
  }

  async getOrderItems(client: PoolClient, orderId: string): Promise<OrderItemRow[]> {
    const { rows } = await client.query<OrderItemRow>(
      "select product_id, quantity from order_items where order_id = $1",
      [orderId],
    );
    return rows;
  }

  async insertItem(
    client: PoolClient,
    orderId: string,
    productId: string,
    quantity: number,
    unitPriceCents: number,
  ): Promise<void> {
    await client.query(
      `insert into order_items (order_id, product_id, quantity, unit_price_cents)
       values ($1, $2, $3, $4)`,
      [orderId, productId, quantity, unitPriceCents],
    );
  }

  /** Records an event id for idempotency; returns false if it was already processed. */
  async markEventProcessed(eventId: string): Promise<boolean> {
    const res = await this.pool.query(
      "insert into processed_events (event_id) values ($1) on conflict (event_id) do nothing",
      [eventId],
    );
    return (res.rowCount ?? 0) > 0;
  }
}
