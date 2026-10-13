import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PoolClient } from "pg";
import { trace } from "@opentelemetry/api";
import { InventoryRepository, type StockItemRow } from "../db/inventory.repository.js";
import { APP_CONFIG, type ServiceConfig } from "../config/config.module.js";
import { MetricsService } from "../observability/metrics.service.js";
import {
  InsufficientStockError,
  ReservationConflictError,
  UnknownStockItemError,
} from "../common/errors.js";
import type { ReserveInput, ReceiveInput } from "./dto.js";
import { alertLevelFor, available, canReserve, suggestedReorderQty } from "./stock-rules.js";

const tracer = trace.getTracer("orderflow.inventory");

export interface ReserveResult {
  orderId: string;
  reserved: { productId: string; quantity: number }[];
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly repo: InventoryRepository,
    private readonly metrics: MetricsService,
    @Inject(APP_CONFIG) private readonly config: ServiceConfig,
  ) {}

  /**
   * Hold stock for an order.
   *
   * Idempotent on (orderId, productId): a retry after a network failure that
   * actually succeeded returns success without holding the stock twice, and a
   * retry whose payload differs is a conflict rather than a silent overwrite.
   */
  async reserve(input: ReserveInput): Promise<ReserveResult> {
    return tracer.startActiveSpan("inventory.reserve", async (span) => {
      span.setAttributes({ "order.id": input.orderId, "items.count": input.items.length });
      try {
        return await this.repo.withTransaction(async (client) => {
          // Sum duplicate lines first. An order listing the same product twice
          // needs the total held; validating and inserting per line would check
          // each against the same snapshot and then silently drop the second
          // one on the unique constraint, under-reserving the order.
          const wanted = new Map<string, number>();
          for (const item of input.items) {
            wanted.set(item.productId, (wanted.get(item.productId) ?? 0) + item.quantity);
          }

          const productIds = [...wanted.keys()];
          const rows = await this.repo.lockItems(client, productIds);
          const byId = new Map(rows.map((r) => [r.product_id, r]));

          // Holds this order already has. Their quantities are already counted
          // in `reserved`, so they must not be re-checked against availability
          // or this order's own successful first attempt would block its retry.
          const existing = new Map(
            (await this.repo.findHeldByOrder(client, input.orderId)).map((r) => [
              r.product_id,
              r.quantity,
            ]),
          );

          const toHold: { productId: string; quantity: number }[] = [];
          for (const [productId, quantity] of wanted) {
            const row = byId.get(productId);
            if (!row) throw new UnknownStockItemError(productId);

            const held = existing.get(productId);
            if (held !== undefined) {
              if (held !== quantity) {
                throw new ReservationConflictError(input.orderId, productId, held, quantity);
              }
              continue; // already applied by an earlier attempt
            }

            if (!canReserve({ onHand: row.on_hand, reserved: row.reserved }, quantity)) {
              this.metrics.reservations.inc({ outcome: "insufficient_stock" });
              throw new InsufficientStockError(
                productId,
                quantity,
                available({ onHand: row.on_hand, reserved: row.reserved }),
              );
            }
            toHold.push({ productId, quantity });
          }

          const expiresAt = new Date(Date.now() + this.config.RESERVATION_TTL_SECONDS * 1000);
          for (const { productId, quantity } of toHold) {
            const inserted = await this.repo.insertReservation(
              client,
              input.orderId,
              productId,
              quantity,
              expiresAt,
            );
            if (!inserted) continue;
            await this.repo.adjustReserved(client, productId, quantity);
            // Re-read rather than reusing the pre-lock snapshot, so the movement
            // records the true running balance.
            const after = await this.repo.getItem(client, productId);
            if (after) {
              await this.recordAndEvaluate(client, after, {
                kind: "RESERVE",
                orderId: input.orderId,
                quantity,
                onHandDelta: 0,
                reservedDelta: 0,
              });
            }
          }

          if (toHold.length > 0) this.metrics.reservations.inc({ outcome: "held" });
          this.logger.log(
            `reserved ${toHold.length} new line(s) for order ${input.orderId} ` +
              `(${existing.size} already held)`,
          );
          return {
            orderId: input.orderId,
            reserved: [...wanted].map(([productId, quantity]) => ({ productId, quantity })),
          };
        });
      } finally {
        span.end();
      }
    });
  }

  /** Clears the hold's expiry once the order actually exists. */
  async confirm(orderId: string): Promise<{ confirmed: number }> {
    return this.repo.withTransaction(async (client) => {
      const confirmed = await this.repo.confirmReservation(client, orderId);
      if (confirmed > 0) this.metrics.reservations.inc({ outcome: "confirmed" });
      return { confirmed };
    });
  }

  /**
   * Give stock back.
   *
   * `releaseIn` runs inside a caller's transaction so an event handler can make
   * the dedup receipt and the stock effect atomic. Only HELD rows are touched,
   * so a replay finds nothing to do and changes nothing.
   */
  async releaseIn(
    client: PoolClient,
    orderId: string,
    reason: string,
  ): Promise<{ released: number }> {
    const held = await this.repo.findHeldByOrder(client, orderId);
    for (const r of held) {
      await this.repo.adjustReserved(client, r.product_id, -r.quantity);
      const after = await this.repo.getItem(client, r.product_id);
      if (!after) continue;
      await this.recordAndEvaluate(client, after, {
        kind: "RELEASE",
        orderId,
        quantity: r.quantity,
        onHandDelta: 0,
        reservedDelta: 0,
        reason,
      });
    }
    if (held.length > 0) {
      await this.repo.setReservationStatus(client, orderId, "RELEASED");
      this.metrics.reservations.inc({ outcome: "released" });
      this.logger.log(`released ${held.length} hold(s) for order ${orderId} (${reason})`);
    }
    return { released: held.length };
  }

  async release(orderId: string, reason: string): Promise<{ released: number }> {
    return this.repo.withTransaction((client) => this.releaseIn(client, orderId, reason));
  }

  /**
   * Ship the goods: stock physically leaves, so both on hand and reserved fall.
   * Like release, only HELD rows are affected, which makes a replay a no-op.
   */
  async commitIn(client: PoolClient, orderId: string): Promise<{ committed: number }> {
    const held = await this.repo.findHeldByOrder(client, orderId);
    for (const r of held) {
      await this.repo.adjustReserved(client, r.product_id, -r.quantity);
      await this.repo.adjustOnHand(client, r.product_id, -r.quantity);
      const after = await this.repo.getItem(client, r.product_id);
      if (!after) continue;
      await this.recordAndEvaluate(client, after, {
        kind: "COMMIT",
        orderId,
        quantity: r.quantity,
        onHandDelta: 0,
        reservedDelta: 0,
      });
    }
    if (held.length > 0) {
      await this.repo.setReservationStatus(client, orderId, "COMMITTED");
      this.metrics.reservations.inc({ outcome: "committed" });
      this.logger.log(`committed ${held.length} hold(s) for order ${orderId}`);
    }
    return { committed: held.length };
  }

  async commit(orderId: string): Promise<{ committed: number }> {
    return this.repo.withTransaction((client) => this.commitIn(client, orderId));
  }

  /** Restock. Resolves an open alert when availability recovers. */
  async receive(input: ReceiveInput): Promise<{ productId: string; onHand: number }> {
    return this.repo.withTransaction(async (client) => {
      const [row] = await this.repo.lockItems(client, [input.productId]);
      if (!row) throw new UnknownStockItemError(input.productId);
      await this.repo.adjustOnHand(client, input.productId, input.quantity);
      const current = (await this.repo.getItem(client, input.productId)) ?? row;
      const after = await this.recordAndEvaluate(client, current, {
        kind: "RECEIVE",
        orderId: null,
        quantity: input.quantity,
        onHandDelta: 0,
        reservedDelta: 0,
        reason: input.reason ?? "stock received",
      });
      this.logger.log(`received ${input.quantity} of ${row.sku}`);
      return { productId: input.productId, onHand: after.onHand };
    });
  }

  /**
   * Writes the audit movement and re-evaluates the alert state for an item.
   * Every mutation funnels through here so no path can change stock without
   * leaving a trace or without the alert state being reconsidered.
   */
  private async recordAndEvaluate(
    client: PoolClient,
    before: StockItemRow,
    change: {
      kind: "RESERVE" | "RELEASE" | "COMMIT" | "RECEIVE" | "ADJUST";
      orderId: string | null;
      quantity: number;
      onHandDelta: number;
      reservedDelta: number;
      reason?: string;
    },
  ): Promise<{ onHand: number; reserved: number }> {
    const onHand = before.on_hand + change.onHandDelta;
    const reserved = before.reserved + change.reservedDelta;

    await this.repo.insertMovement(client, {
      productId: before.product_id,
      orderId: change.orderId,
      kind: change.kind,
      quantity: change.quantity,
      onHandAfter: onHand,
      reservedAfter: reserved,
      reason: change.reason ?? null,
    });
    this.metrics.movements.inc({ kind: change.kind });

    const levels = {
      onHand,
      reserved,
      reorderLevel: before.reorder_level,
      reorderQty: before.reorder_qty,
    };
    const level = alertLevelFor(levels);
    if (level) {
      const opened = await this.repo.openAlert(client, {
        productId: before.product_id,
        sku: before.sku,
        level,
        available: available(levels),
        reorderLevel: before.reorder_level,
        suggestedQty: suggestedReorderQty(levels),
      });
      if (opened) {
        this.logger.warn(
          `stock alert ${level} for ${before.sku}: ${available(levels)} available, ` +
            `suggest reordering ${suggestedReorderQty(levels)}`,
        );
      }
    } else {
      await this.repo.resolveAlert(client, before.product_id);
    }

    return { onHand, reserved };
  }
}
