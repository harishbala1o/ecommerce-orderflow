import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import { ThrottlerModule } from "@nestjs/throttler";
import { trace } from "@opentelemetry/api";
import { UserThrottlerGuard } from "./common/user-throttler.guard.js";
import { ConfigModule } from "./config/config.module.js";
import { DbModule } from "./db/db.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { EventsModule } from "./events/events.module.js";
import { MetricsModule } from "./observability/metrics.module.js";
import { AppController } from "./app.controller.js";

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        autoLogging: true,
        // Correlate every log line with the active trace so logs ↔ traces join.
        mixin() {
          const span = trace.getActiveSpan();
          const ctx = span?.spanContext();
          return ctx ? { trace_id: ctx.traceId, span_id: ctx.spanId } : {};
        },
        redact: ["req.headers['x-action-secret']", "req.headers.authorization"],
      },
    }),
    // Order actions do real transactional work, so they get the tighter budget.
    // Event handlers and probes are exempted at the controller level; see
    // EventsController and MetricsController.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 30 }]),
    MetricsModule,
    ConfigModule,
    DbModule,
    OrdersModule,
    EventsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: UserThrottlerGuard }],
})
export class AppModule {}
