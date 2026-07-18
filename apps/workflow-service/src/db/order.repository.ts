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
}

export interface ProductRow {
  id: string;
  sku: string;
  unit_price_cents: number;
  stock_qty: number;
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

const ORDER_COLUMNS = "id, customer_id, status, total_cents";
const PRODUCT_COLUMNS = "id, sku, unit_price_cents, stock_qty";

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

  async updateStatus(client: PoolClient, id: string, status: OrderStatus): Promise<void> {
    await client.query("update orders set status = $2 where id = $1", [id, status]);
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

  async getProductsForUpdate(client: PoolClient, ids: string[]): Promise<ProductRow[]> {
    const { rows } = await client.query<ProductRow>(
      `select ${PRODUCT_COLUMNS} from products where id = any($1::uuid[]) for update`,
      [ids],
    );
    return rows;
  }

  async createOrder(
    client: PoolClient,
    customerId: string,
    totalCents: number,
  ): Promise<OrderRow> {
    const { rows } = await client.query<OrderRow>(
      `insert into orders (customer_id, status, total_cents)
       values ($1, 'PENDING', $2)
       returning ${ORDER_COLUMNS}`,
      [customerId, totalCents],
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

  /** Guarded decrement; returns false if stock was insufficient (no row updated). */
  async decrementStock(client: PoolClient, productId: string, qty: number): Promise<boolean> {
    const res = await client.query(
      "update products set stock_qty = stock_qty - $2 where id = $1 and stock_qty >= $2",
      [productId, qty],
    );
    return (res.rowCount ?? 0) > 0;
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
