import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { MetricsService } from "./metrics.service.js";

/**
 * Times every request as a RED histogram. The `outcome` label distinguishes:
 *   - ok           : handler succeeded
 *   - client_error : a handled 4xx (business rejection — forbidden transition,
 *                    illegal transition, bad input). This is CORRECT behavior
 *                    and counts as success for the availability SLO.
 *   - server_error : an unhandled/5xx failure — the only thing that burns the
 *                    availability error budget.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ route?: { path?: string }; url: string }>();
    const route = req.route?.path ?? req.url;
    const end = this.metrics.requestDuration.startTimer({ route });
    return next.handle().pipe(
      tap({
        next: () => end({ outcome: "ok" }),
        error: (err: unknown) => end({ outcome: classify(err) }),
      }),
    );
  }
}

function classify(err: unknown): "client_error" | "server_error" {
  if (err instanceof HttpException && err.getStatus() < 500) {
    return "client_error";
  }
  return "server_error";
}
