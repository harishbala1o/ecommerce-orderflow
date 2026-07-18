import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { APP_CONFIG, type ServiceConfig } from "../config/config.module.js";

/** Rejects any request that does not present the shared action secret header. */
@Injectable()
export class HasuraAuthGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: ServiceConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const secret = req.headers["x-action-secret"];
    if (!secret || secret !== this.config.ACTION_SECRET) {
      throw new UnauthorizedException("invalid action secret");
    }
    return true;
  }
}
