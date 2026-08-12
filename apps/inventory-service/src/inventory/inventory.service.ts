import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PoolClient } from "pg";
import { trace } from "@opentelemetry/api";
import { InventoryRepository, type StockItemRow } from "../db/inventory.repository.js";
import { APP_CONFIG, type ServiceConfig } from "../config/config.module.js";
import { MetricsService } from "../observability/metrics.service.js";
import { InsufficientStockError, UnknownStockItemError } from "../common/errors.js";
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
   * Hold stock for an order. Idempotent on orderId: a retry returns success
   * without reserving twice, which matters because the caller may retry after a
   * network failure that actually succeeded.
   */
  async reserve(input: ReserveInput): Promise<ReserveResult> {
    return tracer.startActiveSpan("inventory.reserve", async (span) => {
      span.setAttributes({ "order.id": input.orderId, "items.count": input.items.length });
      try {
        return await this.repo.withTransaction(async (client) => {
          const productIds = input.items.map((i) => i.productId);
          const rows = await this.repo.lockItems(client, productIds);
          const byId = new Map(rows.map((r) => [r.product_id, r]));

          // Check every line before mutating anything: a partial reservation
          // would leave the order half promised.
          for (const item of input.items) {
            const row = byId.get(item.productId);
            if (!row) throw new UnknownStockItemError(item.productId);
            if (!canReserve({ onHand: row.on_hand, reserved: row.reserved }, item.quantity)) {
              this.metrics.reservations.inc({ outcome: "insufficient_stock" });
              throw new InsufficientStockError(
                item.productId,
                item.quantity,
                available({ onHand: row.on_hand, reserved: row.reserved }),
              );
            }
          }

          const expiresAt = new Date(Date.now() + this.config.RESERVATION_TTL_SECONDS * 1000);
          for (const item of input.items) {
            const row = byId.get(item.productId)!;
            const inserted = await this.repo.insertReservation(
              client,
              input.orderId,
              item.productId,
              item.quantity,
              expiresAt,
            );
            if (!inserted) continue; // already reserved by an earlier attempt
            await this.repo.adjustReserved(client, item.productId, item.quantity);
            await this.recordAndEvaluate(client, row, {
              kind: "RESERVE",
              orderId: input.orderId,
              quantity: item.quantity,
              onHandDelta: 0,
              reservedDelta: item.quantity,
            });
          }

          this.metrics.reservations.inc({ outcome: "held" });
          this.logger.log(`reserved ${input.items.length} line(s) for order ${input.orderId}`);
          return {
            orderId: input.orderId,
            reserved: input.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
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

  /** Give stock back. Used on cancellation and by the sweeper. */
  async release(orderId: string, reason: string): Promise<{ released: number }> {
    return this.repo.withTransaction(async (client) => {
      const held = await this.repo.findHeldByOrder(client, orderId);
      for (const r of held) {
        const row = await this.repo.getItem(client, r.product_id);
        if (!row) continue;
        await this.repo.adjustReserved(client, r.product_id, -r.quantity);
        await this.recordAndEvaluate(client, row, {
          kind: "RELEASE",
          orderId,
          quantity: r.quantity,
          onHandDelta: 0,
          reservedDelta: -r.quantity,
          reason,
        });
      }
      if (held.length > 0) {
        await this.repo.setReservationStatus(client, orderId, "RELEASED");
        this.metrics.reservations.inc({ outcome: "released" });
        this.logger.log(`released ${held.length} hold(s) for order ${orderId} (${reason})`);
      }
      return { released: held.length };
    });
  }

  /** Ship the goods: stock physically leaves, so both on hand and reserved fall. */
  async commit(orderId: string): Promise<{ committed: number }> {
    return this.repo.withTransaction(async (client) => {
      const held = await this.repo.findHeldByOrder(client, orderId);
      for (const r of held) {
        const row = await this.repo.getItem(client, r.product_id);
        if (!row) continue;
        await this.repo.adjustReserved(client, r.product_id, -r.quantity);
        await this.repo.adjustOnHand(client, r.product_id, -r.quantity);
        await this.recordAndEvaluate(client, row, {
          kind: "COMMIT",
          orderId,
          quantity: r.quantity,
          onHandDelta: -r.quantity,
          reservedDelta: -r.quantity,
        });
      }
      if (held.length > 0) {
        await this.repo.setReservationStatus(client, orderId, "COMMITTED");
        this.metrics.reservations.inc({ outcome: "committed" });
        this.logger.log(`committed ${held.length} hold(s) for order ${orderId}`);
      }
      return { committed: held.length };
    });
  }

  /** Restock. Resolves an open alert when availability recovers. */
  async receive(input: ReceiveInput): Promise<{ productId: string; onHand: number }> {
    return this.repo.withTransaction(async (client) => {
      const [row] = await this.repo.lockItems(client, [input.productId]);
      if (!row) throw new UnknownStockItemError(input.productId);
      await this.repo.adjustOnHand(client, input.productId, input.quantity);
      const after = await this.recordAndEvaluate(client, row, {
        kind: "RECEIVE",
        orderId: null,
        quantity: input.quantity,
        onHandDelta: input.quantity,
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
