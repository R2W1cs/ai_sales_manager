import "reflect-metadata";
import { NestFactory } from "@nestjs/core";

import { env } from "@app/shared/server";

import { AppModule } from "./app.module";
import { logger } from "./lib/logger";

async function bootstrap() {
  await NestFactory.createApplicationContext(AppModule);
  logger.info({ env: env.NODE_ENV }, "Worker process is running");

  // BullMQ worker logic will go here
}

void bootstrap();
