import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module.js";
import { DbModule } from "../db/db.module.js";
import { OrdersService } from "./orders.service.js";
import { OrdersController } from "./orders.controller.js";

@Module({
  imports: [ConfigModule, DbModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
