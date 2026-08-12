import { Injectable, Logger } from "@nestjs/common";
import { InventoryRepository } from "../db/inventory.repository.js";
import { InventoryService } from "../inventory/inventory.service.js";

export interface OrderEventPayload {
  orderId: string;
  toStatus: string;
}

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly repo: InventoryRepository,
    private readonly inventory: InventoryService,
  ) {}

  /**
   * Reacts to an order lifecycle change.
   *
   * Hasura delivers at least once, so the delivery id is recorded first and a
   * repeat delivery is skipped. The reservation status is a second guard: a
   * replay that somehow got past the ledger would find no HELD rows and change
   * nothing.
   */
  async handleOrderEvent(
    eventId: string,
    payload: OrderEventPayload,
  ): Promise<{ status: string }> {
    const fresh = await this.repo.withTransaction((client) =>
      this.repo.markEventProcessed(client, eventId),
    );
    if (!fresh) {
      return { status: "skipped" };
    }

    switch (payload.toStatus) {
      case "CANCELLED": {
        const { released } = await this.inventory.release(payload.orderId, "order cancelled");
        this.logger.log(`order ${payload.orderId} cancelled: released ${released} hold(s)`);
        return { status: "released" };
      }
      case "SHIPPED": {
        const { committed } = await this.inventory.commit(payload.orderId);
        this.logger.log(`order ${payload.orderId} shipped: committed ${committed} hold(s)`);
        return { status: "committed" };
      }
      default:
        // Every other transition is irrelevant to stock.
        return { status: "ignored" };
    }
  }
}
