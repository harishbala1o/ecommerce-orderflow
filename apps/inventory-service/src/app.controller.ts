import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

/** Liveness and readiness probe. Exempt from rate limiting: polled every 5s. */
@SkipThrottle()
@Controller()
export class AppController {
  @Get("health")
  health(): { status: string } {
    return { status: "ok" };
  }
}
