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
   * The dedup receipt and the stock effect are committed in **one** transaction.
   * Recording the delivery first and committing it separately, as this used to,
   * means a stock effect that then fails is lost for good: Hasura retries, the
   * handler sees the delivery id already recorded, and skips. The order ends up
   * cancelled with its stock still held, and nothing reports it.
   *
   * Rolling the receipt back with the effect makes the retry genuinely
   * reprocess, which is the behaviour at-least-once delivery is for.
   *
   * Replay safety does not rest on the receipt alone. Release and commit act
   * only on reservations still in HELD, so a duplicate that somehow got past
   * the ledger still changes nothing. Event ordering is handled the same way:
   * whichever of cancel or ship is applied first moves the reservation out of
   * HELD, and the later one becomes a no-op rather than a second stock effect.
   */
  async handleOrderEvent(
    eventId: string,
    payload: OrderEventPayload,
  ): Promise<{ status: string }> {
    return this.repo.withTransaction(async (client) => {
      const fresh = await this.repo.markEventProcessed(client, eventId);
      if (!fresh) {
        this.logger.debug(`delivery ${eventId} already processed; skipping`);
        return { status: "skipped" };
      }

      switch (payload.toStatus) {
        case "CANCELLED": {
          const { released } = await this.inventory.releaseIn(
            client,
            payload.orderId,
            "order cancelled",
          );
          this.logger.log(`order ${payload.orderId} cancelled: released ${released} hold(s)`);
          return { status: released > 0 ? "released" : "noop" };
        }
        case "SHIPPED": {
          const { committed } = await this.inventory.commitIn(client, payload.orderId);
          this.logger.log(`order ${payload.orderId} shipped: committed ${committed} hold(s)`);
          return { status: committed > 0 ? "committed" : "noop" };
        }
        default:
          // Every other transition is irrelevant to stock.
          return { status: "ignored" };
      }
    });
  }
}
