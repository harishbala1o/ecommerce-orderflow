import "./observability/tracing.js"; // must be first: installs OTel instrumentation
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module.js";
import { loadServiceConfig } from "./config/config.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  // Body size is bounded by the Express body-parser default (100kb), which is
  // ample headroom over the tiny Action/Event payloads this service receives.
  app.useLogger(app.get(Logger));
  const { PORT } = loadServiceConfig();
  await app.listen(PORT);
  app.get(Logger).log(`workflow-service listening on :${PORT}`);
}

void bootstrap();
