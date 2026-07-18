import { Module } from "@nestjs/common";
import { ConfigModule } from "../config/config.module.js";
import { DbModule } from "../db/db.module.js";
import { EventsService } from "./events.service.js";
import { EventsController } from "./events.controller.js";

@Module({
  imports: [ConfigModule, DbModule],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
