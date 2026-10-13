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
    const candidates = await this.repo.withTransaction((client) =>
      this.repo.findExpiredOrderIds(client),
    );

    for (const orderId of candidates) {
      // Re-check expiry inside the releasing transaction. A confirm can land
      // between selection and release, and reclaiming a confirmed order's stock
      // would oversell it.
      const swept = await this.repo.withTransaction(async (client) => {
        if (!(await this.repo.isStillExpired(client, orderId))) return false;
        await this.service.releaseIn(
          client,
          orderId,
          "reservation expired before the order was confirmed",
        );
        return true;
      });

      if (swept) {
        this.logger.warn(`swept expired reservation for order ${orderId}`);
      } else {
        this.logger.debug(`skipped ${orderId}: confirmed before the sweep reached it`);
      }
    }
  }
}
