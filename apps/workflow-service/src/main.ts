import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { loadServiceConfig } from "./config/config.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  // Body size is bounded by the Express body-parser default (100kb), which is
  // ample headroom over the tiny Action/Event payloads this service receives.
  const { PORT } = loadServiceConfig();
  await app.listen(PORT);
  new Logger("Bootstrap").log(`workflow-service listening on :${PORT}`);
}

void bootstrap();
