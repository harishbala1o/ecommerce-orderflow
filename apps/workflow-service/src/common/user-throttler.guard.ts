import { ExecutionContext, HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from "@nestjs/throttler";
import { MetricsService } from "../observability/metrics.service.js";
import type { HasuraActionBody } from "./hasura.js";

/**
 * Rate limits per *caller* rather than per IP where possible.
 *
 * Hasura forwards the authenticated user id in the Action body, so we key on
 * that: one heavy user then cannot exhaust the shared budget of everyone else
 * behind the same address, which is the normal case here because every request
 * arrives from a single Hasura pod. The IP is only a fallback.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly metrics: MetricsService,
  ) {
    super(options, storageService, reflector);
  }

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const body = req.body as HasuraActionBody | undefined;
    const userId = body?.session_variables?.["x-hasura-user-id"];
    if (userId) return `user:${userId}`;
    return `ip:${(req.ip as string) ?? "unknown"}`;
  }

  /**
   * Surface a 429 in the same structured shape as every other rejection. The
   * guard runs before the controller, so its exception never reaches the
   * controller's error mapper: the shape has to be produced here.
   */
  protected override async throwThrottlingException(context: ExecutionContext): Promise<void> {
    const req = context.switchToHttp().getRequest<{ route?: { path?: string }; url: string }>();
    this.metrics.throttled.inc({ route: req.route?.path ?? req.url });
    throw new HttpException(
      {
        message: "Too many requests, please retry shortly",
        extensions: { code: "rate-limited" },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
