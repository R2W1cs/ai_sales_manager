import { Injectable } from "@nestjs/common";

import type { CanonicalMessage, ChannelAdapter, ChannelType, MapContext } from "@app/shared";

import { logger } from "../../lib/logger";
import { MetaInstagramAdapter } from "../adapters/meta-instagram.adapter";
import { MetaMessengerAdapter } from "../adapters/meta-messenger.adapter";
import { MetaWhatsappAdapter } from "../adapters/meta-whatsapp.adapter";

@Injectable()
export class NormalizerService {
  private readonly adapters: Map<ChannelType, ChannelAdapter>;

  constructor(
    instagramAdapter: MetaInstagramAdapter,
    messengerAdapter: MetaMessengerAdapter,
    whatsappAdapter: MetaWhatsappAdapter,
  ) {
    this.adapters = new Map<ChannelType, ChannelAdapter>([
      ["instagram", instagramAdapter],
      ["messenger", messengerAdapter],
      ["whatsapp", whatsappAdapter],
    ]);
  }

  /**
   * Retrieves the adapter for a given channel.
   */
  getAdapter(channel: ChannelType): ChannelAdapter | undefined {
    return this.adapters.get(channel);
  }

  /**
   * Automatically detects the channel type from raw payload headers or body structure.
   */
  detectChannel(rawPayload: unknown): ChannelType | undefined {
    if (!rawPayload || typeof rawPayload !== "object") {
      return undefined;
    }

    const payload = rawPayload as Record<string, unknown>;

    // 1. Direct channel field
    if (
      payload.channel === "instagram" ||
      payload.channel === "messenger" ||
      payload.channel === "whatsapp"
    ) {
      return payload.channel;
    }

    // 2. Meta Webhook Object
    if (payload.object === "instagram") {
      return "instagram";
    }
    if (payload.object === "page") {
      return "messenger";
    }
    if (payload.object === "whatsapp_business_account") {
      return "whatsapp";
    }

    // 3. Inspect entry changes or messaging structures
    if (Array.isArray(payload.entry) && payload.entry.length > 0) {
      const firstEntry = payload.entry[0] as Record<string, unknown> | undefined;
      if (firstEntry) {
        if (Array.isArray(firstEntry.changes)) {
          return "whatsapp";
        }
        if (Array.isArray(firstEntry.messaging)) {
          // If entry has messaging, default to messenger if not specified
          return "messenger";
        }
      }
    }

    // 4. WhatsApp changes payload structure at top level
    if (payload.messaging_product === "whatsapp" || payload.changes) {
      return "whatsapp";
    }

    return undefined;
  }

  /**
   * 16 §3 / T-INT-03 Normalizes raw provider webhook payload into CanonicalMessage domain interface.
   * Resilient to malformed payloads without crashing the background worker.
   */
  normalize(rawPayload: unknown, ctx?: MapContext): CanonicalMessage[] {
    if (!rawPayload || typeof rawPayload !== "object") {
      logger.warn({ rawPayload }, "NormalizerService received invalid/empty payload");
      return [];
    }

    try {
      const channel = ctx?.channel ?? ctx?.channelType ?? this.detectChannel(rawPayload);

      if (!channel) {
        logger.warn({ rawPayload }, "Unable to detect channel for inbound webhook payload");
        return [];
      }

      const adapter = this.getAdapter(channel);
      if (!adapter) {
        logger.warn({ channel }, "No adapter registered for channel");
        return [];
      }

      return adapter.mapInbound(rawPayload, ctx);
    } catch (err) {
      logger.error(
        { err, rawPayload },
        "Unexpected error in NormalizerService while normalizing payload",
      );
      return [];
    }
  }

  /**
   * Helper returning single canonical message or null.
   */
  normalizeSingle(rawPayload: unknown, ctx?: MapContext): CanonicalMessage | null {
    const messages = this.normalize(rawPayload, ctx);
    return messages[0] ?? null;
  }
}
