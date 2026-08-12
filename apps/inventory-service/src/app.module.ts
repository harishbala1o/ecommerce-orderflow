import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { ScheduleModule } from "@nestjs/schedule";
import { ThrottlerModule } from "@nestjs/throttler";
import { trace } from "@opentelemetry/api";
import { UserThrottlerGuard } from "./common/user-throttler.guard.js";
import { ConfigModule } from "./config/config.module.js";
import { DbModule } from "./db/db.module.js";
import { InventoryModule } from "./inventory/inventory.module.js";
import { EventsModule } from "./events/events.module.js";
import { MetricsModule } from "./observability/metrics.module.js";
import { AppController } from "./app.controller.js";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        autoLogging: true,
        mixin() {
          const span = trace.getActiveSpan();
          const ctx = span?.spanContext();
          return ctx ? { trace_id: ctx.traceId, span_id: ctx.spanId } : {};
        },
        redact: ["req.headers['x-action-secret']", "req.headers.authorization"],
      },
    }),
    ScheduleModule.forRoot(),
    // Inventory commands are cheaper than order actions and are called by the
    // order service on behalf of a user, so the budget is correspondingly higher.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 60 }]),
    MetricsModule,
    ConfigModule,
    DbModule,
    InventoryModule,
    EventsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: UserThrottlerGuard }],
})
export class AppModule {}
