import { All, Controller, Req, Res, UseGuards } from "@nestjs/common";

import type { HttpReply, HttpRequest } from "../../platform/core/http";
import { AuthThrottlerGuard } from "../guards/auth-throttler.guard";
import { auth } from "./better-auth";
import { toFastifyHandler } from "./fastify-adapter";

/**
 * Better Auth catch-all (`/api/auth/*`).
 *
 * `@All` maps to `fastify.all()`, so every method Better Auth uses reaches the
 * handler as a real Fastify route with the normal hook lifecycle. CORS preflight
 * is answered by `@fastify/cors` before this handler runs.
 *
 * The base path itself (`/api/auth`) is not a Better Auth endpoint and is left
 * to the 404 handler; every documented route is `/api/auth/<segment>`.
 */
@Controller("api/auth")
@UseGuards(AuthThrottlerGuard)
export class BetterAuthController {
  private readonly handler = toFastifyHandler(auth.handler);

  @All("*")
  async handleBetterAuth(@Req() req: HttpRequest, @Res() res: HttpReply): Promise<void> {
    await this.handler(req, res);
  }
}
