import { Injectable } from "@nestjs/common";

import type {
  CanonicalMessage,
  CanonicalOutbound,
  ChannelAdapter,
  MapContext,
  SendResult,
} from "@app/shared";
import { env } from "@app/shared/server";

import { logger } from "../../lib/logger";
import { MetaWhatsappAdapter } from "./meta-whatsapp.adapter";

/**
 * WhatsApp Cloud API feature gate (T-INT-06 / 16 §8).
 * Keeps unofficial libraries forbidden. When WHATSAPP_ENABLED=true, delegates to
 * the official MetaWhatsappAdapter (Cloud API only).
 */
@Injectable()
export class WhatsAppCloudStubAdapter implements ChannelAdapter {
  readonly channel = "whatsapp" as const;

  private readonly live = new MetaWhatsappAdapter();

  get outboundLimiter() {
    return this.live.outboundLimiter;
  }

  private isEnabled(): boolean {
    return env.WHATSAPP_ENABLED === "true";
  }

  mapInbound(raw: unknown, ctx?: MapContext): CanonicalMessage[] {
    if (!this.isEnabled()) {
      logger.debug(
        "WhatsApp integration is disabled (WHATSAPP_ENABLED != true); dropping inbound event",
      );
      return [];
    }

    return this.live.mapInbound(raw, ctx);
  }

  send(input: CanonicalOutbound, token: string): Promise<SendResult> {
    if (!this.isEnabled()) {
      return Promise.resolve({
        ok: false,
        retryable: false,
        providerCode: "feature_disabled",
        message: "feature_disabled: WhatsApp Cloud API outbound is disabled",
      });
    }

    return this.live.send(input, token);
  }
}
