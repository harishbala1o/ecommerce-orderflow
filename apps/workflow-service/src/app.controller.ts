import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

/**
 * Liveness and readiness probe. Exempt from rate limiting: Kubernetes polls this
 * every 5 seconds, and a throttled probe would be read as an unhealthy container
 * and trigger a pointless restart.
 */
@SkipThrottle()
@Controller()
export class AppController {
  @Get("health")
  health(): { status: string } {
    return { status: "ok" };
  }
}
