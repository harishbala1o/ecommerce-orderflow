import "./observability/tracing.js"; // must be first: installs OTel instrumentation
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import { loadServiceConfig } from "./config/config.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const { PORT } = loadServiceConfig();
  await app.listen(PORT);
  app.get(Logger).log(`inventory-service listening on :${PORT}`);
}

void bootstrap();
