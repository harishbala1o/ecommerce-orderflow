import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { HasuraAuthGuard } from "../common/hasura-auth.guard.js";
import { parseSession } from "../common/session.js";
import { toActionException } from "../common/action-error.js";
import type { HasuraActionBody } from "../common/hasura.js";
import { OrdersService, type OrderResult } from "./orders.service.js";
import { placeOrderSchema, transitionOrderSchema } from "./dto.js";

@Controller("actions")
@UseGuards(HasuraAuthGuard)
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Post("place-order")
  async placeOrder(@Body() body: HasuraActionBody): Promise<OrderResult> {
    try {
      const session = parseSession(body);
      const input = placeOrderSchema.parse(body.input);
      return await this.service.placeOrder(session, input);
    } catch (err) {
      throw toActionException(err);
    }
  }

  @Post("transition-order")
  async transitionOrder(@Body() body: HasuraActionBody): Promise<OrderResult> {
    try {
      const session = parseSession(body);
      const input = transitionOrderSchema.parse(body.input);
      return await this.service.transitionOrder(session, input);
    } catch (err) {
      throw toActionException(err);
    }
  }
}
