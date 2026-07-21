import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { MetricsService } from "./metrics.service.js";

/** Times every request and records it as a RED histogram (route + ok/error). */
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
        error: () => end({ outcome: "error" }),
      }),
    );
  }
}
