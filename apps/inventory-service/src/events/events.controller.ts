import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { HasuraAuthGuard } from "../common/hasura-auth.guard.js";
import type { HasuraEventBody } from "../common/hasura.js";
import { EventsService } from "./events.service.js";

/**
 * Exempt from rate limiting: Hasura retries failed deliveries, so throttling
 * here would reject retries and silently lose stock releases.
 */
@SkipThrottle()
@Controller("events")
@UseGuards(HasuraAuthGuard)
export class EventsController {
  constructor(private readonly service: EventsService) {}

  @Post("order-event")
  async orderEvent(@Body() body: HasuraEventBody): Promise<{ status: string }> {
    const row = body.event?.data?.new;
    return this.service.handleOrderEvent(body.id ?? "unknown", {
      orderId: String(row?.order_id ?? ""),
      toStatus: String(row?.to_status ?? ""),
    });
  }
}
