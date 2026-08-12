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

/** Times every request; client errors are separated from server errors so that
 *  business rejections such as insufficient stock do not look like outages. */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ route?: { path?: string }; url: string }>();
    const end = this.metrics.requestDuration.startTimer({ route: req.route?.path ?? req.url });
    return next.handle().pipe(
      tap({
        next: () => end({ outcome: "ok" }),
        error: (err: unknown) =>
          end({
            outcome:
              err instanceof HttpException && err.getStatus() < 500 ? "client_error" : "server_error",
          }),
      }),
    );
  }
}
