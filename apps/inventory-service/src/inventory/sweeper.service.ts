import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InventoryRepository } from "../db/inventory.repository.js";
import { InventoryService } from "./inventory.service.js";

/**
 * Reclaims stock held for orders that were never created.
 *
 * This covers exactly one window: the gap between a successful reservation and
 * the order service committing its own transaction. Once the order exists the
 * hold is confirmed, its expiry is cleared, and the sweeper ignores it forever.
 */
@Injectable()
export class SweeperService {
  private readonly logger = new Logger(SweeperService.name);

  constructor(
    private readonly repo: InventoryRepository,
    private readonly service: InventoryService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    const expired = await this.repo.withTransaction((client) =>
      this.repo.findExpiredOrderIds(client),
    );
    for (const orderId of expired) {
      await this.service.release(orderId, "reservation expired before the order was confirmed");
      this.logger.warn(`swept expired reservation for order ${orderId}`);
    }
  }
}
