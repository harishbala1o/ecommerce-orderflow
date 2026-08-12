import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module.js";
import { DbModule } from "../db/db.module.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { EventsController } from "./events.controller.js";
import { EventsService } from "./events.service.js";

@Module({
  imports: [ConfigModule, DbModule, InventoryModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
