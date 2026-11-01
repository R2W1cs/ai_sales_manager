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
export class MetaMessengerAdapter implements ChannelAdapter {
  readonly channel = "messenger" as const;

  /**
   * 16 §7 Outbound rate limiter: 20 msg/sec for Messenger
   */
  readonly outboundLimiter = { max: 20, durationMs: 1000 };

  /**
   * 16 §3 / §4.4 Inbound Normalization for Meta Messenger
   */
  mapInbound(raw: unknown, ctx?: MapContext): CanonicalMessage[] {
    return parseMetaMessagingEvents(raw, "messenger", ctx);
  }

  /**
   * 16 §6.1 Outbound Delivery via Meta Graph API
   */
  send(input: CanonicalOutbound, token: string): Promise<SendResult> {
    return sendMetaGraphMessage(input, token, "messenger");
  }
}
