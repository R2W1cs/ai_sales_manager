import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";

import { env } from "@app/shared/server";

import { AppModule } from "./app.module";
import { configureApp, createHttpAdapter, nestAppOptions } from "./bootstrap";
import { logger } from "./lib/logger";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    createHttpAdapter(),
    nestAppOptions(),
  );

  await configureApp(app);

  // Bind on all interfaces: the container has no route to `localhost` from the
  // load balancer (18 §1).
  await app.listen(env.PORT, "0.0.0.0");
  logger.info(`Server is running on http://localhost:${env.PORT}`);
}

void bootstrap();
