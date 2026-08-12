import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module.js";
import { DbModule } from "../db/db.module.js";
import { InventoryService } from "./inventory.service.js";
import { InventoryController } from "./inventory.controller.js";
import { SweeperService } from "./sweeper.service.js";

@Module({
  imports: [ConfigModule, DbModule],
  controllers: [InventoryController],
  providers: [InventoryService, SweeperService],
  exports: [InventoryService],
})
export class InventoryModule {}
