import { Injectable } from "@nestjs/common";

import type {
  CanonicalMessage,
  CanonicalOutbound,
  ChannelAdapter,
  MapContext,
  SendResult,
} from "@app/shared";

import { parseMetaMessagingEvents, sendMetaGraphMessage } from "./meta-common";

@Injectable()
export class MetaInstagramAdapter implements ChannelAdapter {
  readonly channel = "instagram" as const;

  /**
   * 16 §7 Outbound rate limiter: 10 msg/sec for Instagram
   */
  readonly outboundLimiter = { max: 10, durationMs: 1000 };

  /**
   * 16 §3 / §4.4 Inbound Normalization for Meta Instagram Direct Messages
   */
  mapInbound(raw: unknown, ctx?: MapContext): CanonicalMessage[] {
    return parseMetaMessagingEvents(raw, "instagram", ctx);
  }

  /**
   * 16 §6.1 Outbound Delivery via Meta Graph API for Instagram
   */
  send(input: CanonicalOutbound, token: string): Promise<SendResult> {
    return sendMetaGraphMessage(input, token, "instagram");
  }
}
