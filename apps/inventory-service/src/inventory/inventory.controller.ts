import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { HasuraAuthGuard } from "../common/hasura-auth.guard.js";
import { toHttpException } from "../common/action-error.js";
import { InventoryService } from "./inventory.service.js";
import { receiveSchema, reserveSchema } from "./dto.js";

/**
 * Commands from the order service and from Hasura Actions. Not reachable from
 * the internet: only callers holding the shared action secret get in.
 */
@Controller("inventory")
@UseGuards(HasuraAuthGuard)
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Post("reservations")
  async reserve(@Body() body: unknown) {
    try {
      return await this.service.reserve(reserveSchema.parse(body));
    } catch (err) {
      throw toHttpException(err);
    }
  }

  @Post("reservations/:orderId/confirm")
  async confirm(@Param("orderId") orderId: string) {
    try {
      return await this.service.confirm(orderId);
    } catch (err) {
      throw toHttpException(err);
    }
  }

  @Post("reservations/:orderId/release")
  async release(@Param("orderId") orderId: string) {
    try {
      return await this.service.release(orderId, "released by order service");
    } catch (err) {
      throw toHttpException(err);
    }
  }

  @Post("receive")
  async receive(@Body() body: unknown) {
    try {
      return await this.service.receive(receiveSchema.parse(body));
    } catch (err) {
      throw toHttpException(err);
    }
  }
}
