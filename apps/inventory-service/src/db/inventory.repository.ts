import { Inject, Injectable } from "@nestjs/common";
import { Pool, type PoolClient } from "pg";
import { PG_POOL } from "./tokens.js";

export interface StockItemRow {
  product_id: string;
  sku: string;
  on_hand: number;
  reserved: number;
  reorder_level: number;
  reorder_qty: number;
}

export interface ReservationRow {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  status: "HELD" | "RELEASED" | "COMMITTED";
}

export type MovementKind = "RESERVE" | "RELEASE" | "COMMIT" | "RECEIVE" | "ADJUST";

const ITEM_COLUMNS = "product_id, sku, on_hand, reserved, reorder_level, reorder_qty";

@Injectable()
export class InventoryRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Locks the given stock rows for the rest of the transaction. Ordering by
   * product_id gives every caller the same lock order, which prevents two
   * concurrent multi-item reservations from deadlocking against each other.
   */
  async lockItems(client: PoolClient, productIds: string[]): Promise<StockItemRow[]> {
    const { rows } = await client.query<StockItemRow>(
      `select ${ITEM_COLUMNS} from stock_items
       where product_id = any($1::uuid[])
       order by product_id
       for update`,
      [productIds],
    );
    return rows;
  }

  async getItem(client: PoolClient, productId: string): Promise<StockItemRow | null> {
    const { rows } = await client.query<StockItemRow>(
      `select ${ITEM_COLUMNS} from stock_items where product_id = $1`,
      [productId],
    );
    return rows[0] ?? null;
  }

  async adjustReserved(client: PoolClient, productId: string, delta: number): Promise<void> {
    await client.query("update stock_items set reserved = reserved + $2 where product_id = $1", [
      productId,
      delta,
    ]);
  }

  async adjustOnHand(client: PoolClient, productId: string, delta: number): Promise<void> {
    await client.query("update stock_items set on_hand = on_hand + $2 where product_id = $1", [
      productId,
      delta,
    ]);
  }

  /** Idempotent: a repeated reserve for the same order and product is a no-op. */
  async insertReservation(
    client: PoolClient,
    orderId: string,
    productId: string,
    quantity: number,
    expiresAt: Date,
  ): Promise<boolean> {
    const { rowCount } = await client.query(
      `insert into reservations (order_id, product_id, quantity, status, expires_at)
       values ($1, $2, $3, 'HELD', $4)
       on conflict (order_id, product_id) do nothing`,
      [orderId, productId, quantity, expiresAt],
    );
    return (rowCount ?? 0) > 0;
  }

  async findHeldByOrder(client: PoolClient, orderId: string): Promise<ReservationRow[]> {
    const { rows } = await client.query<ReservationRow>(
      `select id, order_id, product_id, quantity, status from reservations
       where order_id = $1 and status = 'HELD'
       order by product_id
       for update`,
      [orderId],
    );
    return rows;
  }

  async setReservationStatus(
    client: PoolClient,
    orderId: string,
    status: "RELEASED" | "COMMITTED",
  ): Promise<void> {
    await client.query(
      "update reservations set status = $2 where order_id = $1 and status = 'HELD'",
      [orderId, status],
    );
  }

  /** Clearing the expiry marks the hold as confirmed, so the sweeper leaves it alone. */
  async confirmReservation(client: PoolClient, orderId: string): Promise<number> {
    const { rowCount } = await client.query(
      "update reservations set expires_at = null where order_id = $1 and status = 'HELD'",
      [orderId],
    );
    return rowCount ?? 0;
  }

  /** Order ids whose holds have expired without ever being confirmed. */
  async findExpiredOrderIds(client: PoolClient, limit = 100): Promise<string[]> {
    const { rows } = await client.query<{ order_id: string }>(
      `select distinct order_id from reservations
       where status = 'HELD' and expires_at is not null and expires_at < now()
       limit $1`,
      [limit],
    );
    return rows.map((r) => r.order_id);
  }

  async insertMovement(
    client: PoolClient,
    m: {
      productId: string;
      orderId: string | null;
      kind: MovementKind;
      quantity: number;
      onHandAfter: number;
      reservedAfter: number;
      reason?: string | null;
    },
  ): Promise<void> {
    await client.query(
      `insert into stock_movements
         (product_id, order_id, kind, quantity, on_hand_after, reserved_after, reason)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [m.productId, m.orderId, m.kind, m.quantity, m.onHandAfter, m.reservedAfter, m.reason ?? null],
    );
  }

  /** Returns true the first time a given Hasura delivery is seen. */
  async markEventProcessed(client: PoolClient, eventId: string): Promise<boolean> {
    const { rowCount } = await client.query(
      "insert into processed_events (event_id) values ($1) on conflict do nothing",
      [eventId],
    );
    return (rowCount ?? 0) > 0;
  }

  async openAlert(
    client: PoolClient,
    a: {
      productId: string;
      sku: string;
      level: "LOW" | "OUT_OF_STOCK";
      available: number;
      reorderLevel: number;
      suggestedQty: number;
    },
  ): Promise<boolean> {
    // The partial unique index makes "at most one open alert per product" a
    // database guarantee rather than a check a concurrent call could race past.
    const { rowCount } = await client.query(
      `insert into stock_alerts
         (product_id, sku, level, available, reorder_level, suggested_qty)
       values ($1, $2, $3, $4, $5, $6)
       on conflict do nothing`,
      [a.productId, a.sku, a.level, a.available, a.reorderLevel, a.suggestedQty],
    );
    return (rowCount ?? 0) > 0;
  }

  async resolveAlert(client: PoolClient, productId: string): Promise<void> {
    await client.query(
      `update stock_alerts set status = 'RESOLVED', resolved_at = now()
       where product_id = $1 and status = 'OPEN'`,
      [productId],
    );
  }

  async countOpenAlerts(): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      "select count(*)::text as count from stock_alerts where status = 'OPEN'",
    );
    return Number(rows[0]?.count ?? 0);
  }

  async allItems(): Promise<StockItemRow[]> {
    const { rows } = await this.pool.query<StockItemRow>(
      `select ${ITEM_COLUMNS} from stock_items order by sku`,
    );
    return rows;
  }
}
