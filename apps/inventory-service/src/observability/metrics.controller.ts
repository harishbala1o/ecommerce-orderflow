import { Controller, Get, Header } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { InventoryRepository } from "../db/inventory.repository.js";
import { MetricsService } from "./metrics.service.js";

/** Prometheus scrape endpoint. Exempt from rate limiting: scraped every 5 seconds. */
@SkipThrottle()
@Controller("metrics")
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly repo: InventoryRepository,
  ) {}

  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async scrape(): Promise<string> {
    // Stock levels are gauges: refresh them from the database at scrape time
    // rather than trying to keep counters in sync with every mutation path.
    const items = await this.repo.allItems();
    for (const i of items) {
      this.metrics.onHand.set({ sku: i.sku }, i.on_hand);
      this.metrics.reserved.set({ sku: i.sku }, i.reserved);
      this.metrics.availableQty.set({ sku: i.sku }, i.on_hand - i.reserved);
    }
    this.metrics.openAlerts.set(await this.repo.countOpenAlerts());
    return this.metrics.registry.metrics();
  }
}
