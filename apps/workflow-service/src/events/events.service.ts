import { Injectable, Logger } from "@nestjs/common";
import { OrderRepository } from "../db/order.repository.js";

export interface OrderEventSideEffect {
  orderId: string;
  toStatus: string;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly repo: OrderRepository) {}

  /**
   * Idempotent handler for the `order_events` insert trigger. Hasura delivers
   * at-least-once, so we dedupe on the delivery id before running side effects.
   */
  async handleOrderEvent(
    eventId: string,
    payload: OrderEventSideEffect,
  ): Promise<{ status: "ok" | "skipped" }> {
    const fresh = await this.repo.markEventProcessed(eventId);
    if (!fresh) {
      this.logger.log(`event ${eventId} already processed; skipping`);
      return { status: "skipped" };
    }
    // Side-effect stub. M5 replaces this with real notifications + metrics.
    this.logger.log(`notification.sent for order ${payload.orderId} -> ${payload.toStatus}`);
    return { status: "ok" };
  }
}
