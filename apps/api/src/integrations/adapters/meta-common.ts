import type {
  CanonicalAttachment,
  CanonicalMessage,
  CanonicalOutbound,
  MapContext,
  SendResult,
} from "@app/shared";

import { logger } from "../../lib/logger";
import { MetaApiClient } from "../meta/meta-api.client";

/**
 * Parses Meta timestamp safely into ISO-8601 string.
 */
export function parseMetaTimestamp(timestampRaw: unknown): string {
  if (typeof timestampRaw === "number" && !isNaN(timestampRaw)) {
    const ms = timestampRaw < 1e11 ? timestampRaw * 1000 : timestampRaw;
    return new Date(ms).toISOString();
  }

  if (typeof timestampRaw === "string" && timestampRaw.trim().length > 0) {
    const tsNum = Number(timestampRaw);
    if (!isNaN(tsNum)) {
      const ms = tsNum < 1e11 ? tsNum * 1000 : tsNum;
      return new Date(ms).toISOString();
    }
    const parsed = Date.parse(timestampRaw);
    if (!isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  return new Date().toISOString();
}

/**
 * 16 §3 / §4.4 Shared parser for Meta Graph inbound webhooks (Instagram Direct & Messenger).
 */
export function parseMetaMessagingEvents(
  raw: unknown,
  channel: "instagram" | "messenger",
  ctx?: MapContext,
): CanonicalMessage[] {
  const results: CanonicalMessage[] = [];

  if (!raw || typeof raw !== "object") {
    return results;
  }

  try {
    const payload = raw as Record<string, unknown>;
    const entries = Array.isArray(payload.entry) ? payload.entry : Array.isArray(raw) ? raw : [raw];

    for (const entryItem of entries) {
      if (!entryItem || typeof entryItem !== "object") continue;
      const entry = entryItem as Record<string, unknown>;
      const entryId = typeof entry.id === "string" ? entry.id : undefined;

      // Graph events exist in entry.messaging, entry.standby, or direct entry
      const messagingList = Array.isArray(entry.messaging)
        ? entry.messaging
        : Array.isArray(entry.standby)
          ? entry.standby
          : entry.sender && entry.recipient
            ? [entry]
            : [];

      for (const item of messagingList) {
        if (!item || typeof item !== "object") continue;
        const msgEvent = item as Record<string, unknown>;

        try {
          const sender = msgEvent.sender as { id?: string } | undefined;
          const recipient = msgEvent.recipient as { id?: string } | undefined;
          const senderId = sender?.id ?? "unknown";
          const recipientId = recipient?.id ?? entryId ?? ctx?.channelAccountId ?? "unknown";
          const timestamp = parseMetaTimestamp(msgEvent.timestamp);

          const message = msgEvent.message as
            | {
                mid?: string;
                text?: string;
                is_echo?: boolean;
                attachments?: {
                  type?: string;
                  payload?: { url?: string; [key: string]: unknown };
                  url?: string;
                }[];
                quick_reply?: { payload?: string };
              }
            | undefined;

          if (message) {
            const isEcho = Boolean(message.is_echo);
            // 16 §3.1: Invert sender/recipient for echoes so platformUserId is customer, externalAccountId is page
            const platformUserId = isEcho ? recipientId : senderId;
            const externalAccountId = isEcho ? senderId : recipientId;
            const externalMessageId =
              message.mid ?? `${channel}_msg_${platformUserId}_${Date.now()}`;
            const text =
              typeof message.text === "string"
                ? message.text
                : typeof message.quick_reply?.payload === "string"
                  ? message.quick_reply.payload
                  : null;

            const attachments: CanonicalAttachment[] = [];
            if (Array.isArray(message.attachments)) {
              for (const att of message.attachments) {
                const providerUrl = att.payload?.url ?? att.url;
                attachments.push({
                  type: att.type ?? "unknown",
                  providerUrl,
                  url: providerUrl,
                });
              }
            }

            results.push({
              provider: "meta",
              channel,
              channelType: channel,
              eventKind: "message",
              externalAccountId,
              channelAccountId: externalAccountId,
              externalThreadId: platformUserId,
              externalMessageId,
              platformUserId,
              externalSenderId: platformUserId,
              text,
              attachments,
              timestamp,
              isEcho,
              rawEventId: ctx?.rawEventId,
            });
          } else if (msgEvent.delivery) {
            const delivery = msgEvent.delivery as {
              mids?: string[];
              watermark?: number;
            };
            const mid = delivery.mids?.[0] ?? `delivery_${Date.now()}`;
            results.push({
              provider: "meta",
              channel,
              channelType: channel,
              eventKind: "delivery",
              externalAccountId: recipientId,
              channelAccountId: recipientId,
              externalThreadId: senderId,
              externalMessageId: mid,
              platformUserId: senderId,
              externalSenderId: senderId,
              text: null,
              attachments: [],
              timestamp,
              isEcho: false,
              rawEventId: ctx?.rawEventId,
            });
          } else if (msgEvent.read) {
            const read = msgEvent.read as { watermark?: number };
            const mid = `read_${read.watermark ?? Date.now()}`;
            results.push({
              provider: "meta",
              channel,
              channelType: channel,
              eventKind: "read",
              externalAccountId: recipientId,
              channelAccountId: recipientId,
              externalThreadId: senderId,
              externalMessageId: mid,
              platformUserId: senderId,
              externalSenderId: senderId,
              text: null,
              attachments: [],
              timestamp,
              isEcho: false,
              rawEventId: ctx?.rawEventId,
            });
          } else if (msgEvent.postback) {
            const postback = msgEvent.postback as {
              mid?: string;
              title?: string;
              payload?: string;
            };
            const mid = postback.mid ?? `postback_${Date.now()}`;
            results.push({
              provider: "meta",
              channel,
              channelType: channel,
              eventKind: "other",
              externalAccountId: recipientId,
              channelAccountId: recipientId,
              externalThreadId: senderId,
              externalMessageId: mid,
              platformUserId: senderId,
              externalSenderId: senderId,
              text: postback.title ?? postback.payload ?? null,
              attachments: [],
              timestamp,
              isEcho: false,
              rawEventId: ctx?.rawEventId,
            });
          } else if (msgEvent.reaction) {
            const reaction = msgEvent.reaction as {
              mid?: string;
              action?: string;
              emoji?: string;
            };
            const mid = reaction.mid ?? `reaction_${Date.now()}`;
            results.push({
              provider: "meta",
              channel,
              channelType: channel,
              eventKind: "other",
              externalAccountId: recipientId,
              channelAccountId: recipientId,
              externalThreadId: senderId,
              externalMessageId: mid,
              platformUserId: senderId,
              externalSenderId: senderId,
              text: reaction.emoji ?? reaction.action ?? null,
              attachments: [],
              timestamp,
              isEcho: false,
              rawEventId: ctx?.rawEventId,
            });
          }
        } catch (itemErr) {
          logger.warn({ itemErr, item }, `Failed to normalize ${channel} event item`);
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, `Malformed ${channel} webhook payload`);
  }

  return results;
}

/**
 * 16 §6 Meta Graph API outbound dispatcher with 10s timeout and transient error detection.
 * Delegates to unified MetaApiClient.
 */
export async function sendMetaGraphMessage(
  input: CanonicalOutbound,
  token: string,
  channel: "instagram" | "messenger",
): Promise<SendResult> {
  const client = new MetaApiClient();
  return client.sendMessage({ ...input, channel }, token);
}
