import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { DbModule } from "../db/db.module.js";
import { MetricsService } from "./metrics.service.js";
import { MetricsController } from "./metrics.controller.js";
import { MetricsInterceptor } from "./metrics.interceptor.js";

@Global()
@Module({
  imports: [DbModule],
  controllers: [MetricsController],
  providers: [MetricsService, { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }],
  exports: [MetricsService],
})
export class MetricsModule {}
