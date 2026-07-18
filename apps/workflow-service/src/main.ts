import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module.js";
import { loadServiceConfig } from "./config/config.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const { PORT } = loadServiceConfig();
  await app.listen(PORT);
  new Logger("Bootstrap").log(`workflow-service listening on :${PORT}`);
}

void bootstrap();
