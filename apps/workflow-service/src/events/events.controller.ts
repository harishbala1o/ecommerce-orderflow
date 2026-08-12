import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { HasuraAuthGuard } from "../common/hasura-auth.guard.js";
import type { HasuraEventBody } from "../common/hasura.js";
import { EventsService } from "./events.service.js";

/**
 * Deliberately exempt from rate limiting. Hasura retries failed event deliveries,
 * so throttling this endpoint would reject retries and silently drop side
 * effects, defeating the at-least-once guarantee. The endpoint is not reachable
 * from the internet and is already gated by the shared action secret.
 */
@SkipThrottle()
@Controller("events")
@UseGuards(HasuraAuthGuard)
export class EventsController {
  constructor(private readonly service: EventsService) {}

  @Post("order-event")
  async orderEvent(@Body() body: HasuraEventBody): Promise<{ status: string }> {
    const row = body.event?.data?.new;
    return this.service.handleOrderEvent(body.id, {
      orderId: row?.order_id ?? "unknown",
      toStatus: row?.to_status ?? "unknown",
    });
  }
}
