import { Inject, Injectable, Logger } from "@nestjs/common";
import { InsufficientStockError } from "@ecommerce-orderflow/domain";
import { APP_CONFIG, type ServiceConfig } from "../config/config.module.js";

export interface ReserveItem {
  productId: string;
  quantity: number;
}

/**
 * Client for the inventory bounded context.
 *
 * The two services own separate databases, so a single transaction across both
 * is impossible. Consistency comes from reservation plus compensation instead:
 * see release() and the inventory service's sweeper.
 */
@Injectable()
export class InventoryClient {
  private readonly logger = new Logger(InventoryClient.name);

  constructor(@Inject(APP_CONFIG) private readonly config: ServiceConfig) {}

  /**
   * Hold stock for an order. Throws the domain InsufficientStockError so callers
   * and the user-facing error surface stay identical to before inventory was
   * split out.
   */
  async reserve(orderId: string, items: ReserveItem[]): Promise<void> {
    const res = await this.post("/inventory/reservations", { orderId, items });
    if (res.status === 409) {
      const body = (await res.json().catch(() => ({}))) as {
        extensions?: { productId?: string; requested?: number; available?: number };
      };
      const e = body.extensions ?? {};
      throw new InsufficientStockError(e.productId ?? "unknown", e.requested ?? 0, e.available ?? 0);
    }
    if (!res.ok) {
      throw new Error(`inventory reserve failed with ${res.status}`);
    }
  }

  /** Marks the hold as belonging to a real order, so the sweeper leaves it alone. */
  async confirm(orderId: string): Promise<void> {
    const res = await this.post(`/inventory/reservations/${orderId}/confirm`, {});
    if (!res.ok) throw new Error(`inventory confirm failed with ${res.status}`);
  }

  /**
   * Compensating action for a reservation whose order was never created.
   * Never throws: the caller is already handling a failure, and the sweeper is
   * the backstop if this does not get through.
   */
  async releaseQuietly(orderId: string): Promise<void> {
    try {
      await this.post(`/inventory/reservations/${orderId}/release`, {});
    } catch (err) {
      this.logger.error(
        `compensating release failed for order ${orderId}; the inventory sweeper will reclaim it`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private post(path: string, body: unknown): Promise<Response> {
    return fetch(`${this.config.INVENTORY_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-action-secret": this.config.ACTION_SECRET,
      },
      body: JSON.stringify(body),
    });
  }
}
