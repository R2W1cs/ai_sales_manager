import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";

import { getRawBodyBuffer, MetaHmacGuard, type RawBodyRequest } from "../guards/meta-hmac.guard";
import { type MetaWebhookPayload, WebhooksService } from "./webhooks.service";

export interface DeauthorizeBody {
  signed_request?: string;
  [key: string]: unknown;
}

/**
 * Extracts signed_request token from request body (16 §4.5).
 */
export function extractSignedRequest(body: DeauthorizeBody | string): string | undefined {
  if (typeof body === "string") {
    return body.startsWith("signed_request=")
      ? body.slice("signed_request=".length).trim()
      : body.trim();
  }
  if (typeof body === "object") {
    return body.signed_request;
  }
  return undefined;
}

@Controller()
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * 16 §4.1 / 13 §10.3 GET /webhooks/meta (Meta Webhook Hub Verify Challenge)
   * Responds with hub.challenge as text/plain when verify token matches.
   */
  @Get(["webhooks/meta", "api/v1/webhooks/meta"])
  @Header("Content-Type", "text/plain")
  @HttpCode(HttpStatus.OK)
  verifyWebhookChallenge(@Query() query: Record<string, unknown>): string {
    return this.webhooksService.verifyChallenge(query);
  }

  /**
   * 16 §4.2 / 13 §10.3 POST /webhooks/meta (Meta Inbound Ingestion)
   * Authenticated via HMAC SHA-256 (MetaHmacGuard). Fast 200 ACK with async persistence.
   */
  @Post(["webhooks/meta", "api/v1/webhooks/meta"])
  @HttpCode(HttpStatus.OK)
  @UseGuards(MetaHmacGuard)
  async handleMetaWebhook(
    @Body() body: MetaWebhookPayload,
    @Req() req: RawBodyRequest,
  ): Promise<{ ok: boolean }> {
    const rawBody = getRawBodyBuffer(req);
    return this.webhooksService.handleWebhook(body, rawBody, req.headers);
  }

  /**
   * 16 §4.5 / 13 §10.3 POST /webhooks/meta/deauthorize (Meta App Deauthorization Callback)
   * Signed request verification with app secret, status update and worker dispatch.
   */
  @Post(["webhooks/meta/deauthorize", "api/v1/webhooks/meta/deauthorize"])
  @HttpCode(HttpStatus.OK)
  async handleDeauthorize(
    @Body() body: DeauthorizeBody | string,
    @Req() req: RawBodyRequest,
  ): Promise<{ ok: boolean }> {
    const signedRequest = extractSignedRequest(body);
    return this.webhooksService.handleDeauthorize(signedRequest, req.headers);
  }
}
