import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module.js";
import { DbModule } from "./db/db.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { EventsModule } from "./events/events.module.js";
import { AppController } from "./app.controller.js";

@Module({
  imports: [ConfigModule, DbModule, OrdersModule, EventsModule],
  controllers: [AppController],
})
export class AppModule {}
