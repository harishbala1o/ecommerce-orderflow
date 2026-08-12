import { Module } from "@nestjs/common";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3002),
  ACTION_SECRET: z.string().min(1),
  /** How long an unconfirmed reservation is held before the sweeper reclaims it. */
  RESERVATION_TTL_SECONDS: z.coerce.number().int().positive().default(300),
});

export type ServiceConfig = z.infer<typeof schema>;

export const APP_CONFIG = Symbol("APP_CONFIG");

export function loadServiceConfig(
  env: Record<string, string | undefined> = process.env,
): ServiceConfig {
  const result = schema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid service configuration:\n${issues}`);
  }
  return result.data;
}

@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadServiceConfig() }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
