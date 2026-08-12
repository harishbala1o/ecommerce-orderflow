import { Controller, Get, Header } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { MetricsService } from "./metrics.service.js";

/**
 * Prometheus scrape endpoint. Intentionally not behind the action-secret guard,
 * and exempt from rate limiting: Prometheus scrapes every 5 seconds, which would
 * otherwise consume the whole per-minute budget on its own.
 */
@SkipThrottle()
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  async scrape(): Promise<string> {
    return this.metrics.registry.metrics();
  }
}
