import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { trace } from "@opentelemetry/api";
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
    MetricsModule,
    ConfigModule,
    DbModule,
    OrdersModule,
    EventsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
