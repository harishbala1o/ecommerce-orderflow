import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
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
    if (!secret || !this.matchesSecret(secret)) {
      throw new UnauthorizedException("invalid action secret");
    }
    return true;
  }

  /** Constant-time comparison so the check leaks no timing signal about the secret. */
  private matchesSecret(provided: string): boolean {
    const expected = Buffer.from(this.config.ACTION_SECRET, "utf8");
    const actual = Buffer.from(provided, "utf8");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
