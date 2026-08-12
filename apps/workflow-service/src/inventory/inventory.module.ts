import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module.js";
import { InventoryClient } from "./inventory.client.js";

@Module({
  imports: [ConfigModule],
  providers: [InventoryClient],
  exports: [InventoryClient],
})
export class InventoryModule {}
