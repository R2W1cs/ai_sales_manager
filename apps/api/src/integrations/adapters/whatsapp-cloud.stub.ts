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

/**
 * WhatsApp Cloud API Adapter Stub (T-INT-06 / 16 §8).
 * Enforces strict feature gating: WhatsApp functionality is gated behind WHATSAPP_ENABLED=true.
 * In Phase 1 MVP, all unofficial scraping libraries are forbidden.
 */
@Injectable()
export class WhatsAppCloudStubAdapter implements ChannelAdapter {
  readonly channel = "whatsapp" as const;

  /**
   * Outbound rate limiter stub: 0 / n/a until Phase 2 Cloud API flag is on.
   */
  readonly outboundLimiter = { max: 0, durationMs: 1000 };

  private isEnabled(): boolean {
    return env.WHATSAPP_ENABLED === "true";
  }

  /**
   * Map inbound WhatsApp webhook events to canonical format.
   * When WHATSAPP_ENABLED is false/unset, drops events and returns an empty array.
   */
  mapInbound(_raw: unknown, _ctx?: MapContext): CanonicalMessage[] {
    if (!this.isEnabled()) {
      logger.debug(
        "WhatsApp integration is disabled (WHATSAPP_ENABLED != true); dropping inbound event",
      );
      return [];
    }

    // Phase 2: parse incoming Cloud API webhook payload
    return [];
  }

  /**
   * Send outbound WhatsApp message.
   * Returns feature_disabled when WHATSAPP_ENABLED is false, or not_implemented in Phase 1 stub.
   */
  send(_input: CanonicalOutbound, _token: string): Promise<SendResult> {
    if (!this.isEnabled()) {
      return Promise.resolve({
        ok: false,
        retryable: false,
        providerCode: "feature_disabled",
        message: "feature_disabled: WhatsApp Cloud API outbound is disabled in MVP",
      });
    }

    return Promise.resolve({
      ok: false,
      retryable: false,
      providerCode: "not_implemented",
      message: "WhatsApp Cloud API outbound is not yet implemented (Phase 2)",
    });
  }
}
