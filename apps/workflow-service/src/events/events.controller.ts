import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { HasuraAuthGuard } from "../common/hasura-auth.guard.js";
import type { HasuraEventBody } from "../common/hasura.js";
import { EventsService } from "./events.service.js";

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
