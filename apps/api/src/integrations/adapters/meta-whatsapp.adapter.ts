import { Injectable } from "@nestjs/common";

import type {
  CanonicalAttachment,
  CanonicalMessage,
  CanonicalOutbound,
  ChannelAdapter,
  MapContext,
  SendResult,
} from "@app/shared";
import { env } from "@app/shared/server";

import { logger } from "../../lib/logger";
import { parseMetaTimestamp } from "./meta-common";

@Injectable()
export class MetaWhatsappAdapter implements ChannelAdapter {
  readonly channel = "whatsapp" as const;

  /**
   * 16 §7 Outbound rate limiter: 0 / n/a until flag in MVP (Phase 2 Cloud API)
   */
  readonly outboundLimiter = { max: 0, durationMs: 1000 };

  /**
   * 16 §3 / §8 Inbound Normalization for WhatsApp Cloud API (stub / no-op map when WHATSAPP_ENABLED is false)
   */
  mapInbound(raw: unknown, ctx?: MapContext): CanonicalMessage[] {
    const isEnabled = env.WHATSAPP_ENABLED === "true";
    if (!isEnabled) {
      // 16 §3 & §2.7: no-op map until the flag is on
      return [];
    }

    const results: CanonicalMessage[] = [];

    if (!raw || typeof raw !== "object") {
      return results;
    }

    try {
      const payload = raw as Record<string, unknown>;
      const entries = Array.isArray(payload.entry)
        ? payload.entry
        : Array.isArray(raw)
          ? raw
          : [raw];

      for (const entryItem of entries) {
        if (!entryItem || typeof entryItem !== "object") continue;
        const entry = entryItem as Record<string, unknown>;
        const entryId = typeof entry.id === "string" ? entry.id : undefined;

        const changes = Array.isArray(entry.changes)
          ? entry.changes
          : entry.value
            ? [{ value: entry.value }]
            : [];

        for (const changeItem of changes) {
          if (!changeItem || typeof changeItem !== "object") continue;
          const change = changeItem as Record<string, unknown>;
          const value = (change.value ?? change) as Record<string, unknown>;

          if (typeof value !== "object") continue;

          const metadata = value.metadata as
            | { phone_number_id?: string; display_phone_number?: string }
            | undefined;
          const channelAccountId =
            metadata?.phone_number_id ?? entryId ?? ctx?.channelAccountId ?? "unknown";

          // Process inbound messages
          const messagesList = Array.isArray(value.messages) ? value.messages : [];
          for (const msgItem of messagesList) {
            if (!msgItem || typeof msgItem !== "object") continue;
            const msg = msgItem as Record<string, unknown>;

            try {
              const externalMessageId =
                typeof msg.id === "string"
                  ? msg.id
                  : `whatsapp_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
              const externalSenderId = typeof msg.from === "string" ? msg.from : "unknown";
              const timestamp = parseMetaTimestamp(msg.timestamp);

              const msgType = typeof msg.type === "string" ? msg.type : "text";
              let text: string | null = null;
              const attachments: CanonicalAttachment[] = [];
              let eventKind: "message" | "other" = "message";

              if (msgType === "text") {
                const textObj = msg.text as { body?: string } | undefined;
                text = textObj?.body ?? null;
              } else if (msgType === "image") {
                const img = msg.image as
                  | { id?: string; mime_type?: string; sha256?: string; caption?: string }
                  | undefined;
                text = img?.caption ?? null;
                if (img?.id) {
                  attachments.push({
                    type: "image",
                    providerUrl: `whatsapp-media://${img.id}`,
                    url: `whatsapp-media://${img.id}`,
                  });
                }
              } else if (msgType === "audio" || msgType === "voice") {
                const audio = msg[msgType] as { id?: string; mime_type?: string } | undefined;
                if (audio?.id) {
                  attachments.push({
                    type: "audio",
                    providerUrl: `whatsapp-media://${audio.id}`,
                    url: `whatsapp-media://${audio.id}`,
                  });
                }
              } else if (msgType === "video") {
                const video = msg.video as
                  | { id?: string; mime_type?: string; caption?: string }
                  | undefined;
                text = video?.caption ?? null;
                if (video?.id) {
                  attachments.push({
                    type: "video",
                    providerUrl: `whatsapp-media://${video.id}`,
                    url: `whatsapp-media://${video.id}`,
                  });
                }
              } else if (msgType === "document") {
                const doc = msg.document as
                  | { id?: string; filename?: string; caption?: string }
                  | undefined;
                text = doc?.caption ?? doc?.filename ?? null;
                if (doc?.id) {
                  attachments.push({
                    type: "document",
                    providerUrl: `whatsapp-media://${doc.id}`,
                    url: `whatsapp-media://${doc.id}`,
                  });
                }
              } else if (msgType === "sticker") {
                const sticker = msg.sticker as { id?: string } | undefined;
                if (sticker?.id) {
                  attachments.push({
                    type: "sticker",
                    providerUrl: `whatsapp-media://${sticker.id}`,
                    url: `whatsapp-media://${sticker.id}`,
                  });
                }
              } else if (msgType === "button") {
                const btn = msg.button as { text?: string; payload?: string } | undefined;
                text = btn?.text ?? btn?.payload ?? null;
              } else if (msgType === "interactive") {
                const interactive = msg.interactive as
                  | {
                      type?: string;
                      button_reply?: { id?: string; title?: string };
                      list_reply?: { id?: string; title?: string };
                    }
                  | undefined;
                text =
                  interactive?.button_reply?.title ??
                  interactive?.button_reply?.id ??
                  interactive?.list_reply?.title ??
                  interactive?.list_reply?.id ??
                  null;
              } else if (msgType === "reaction") {
                eventKind = "other";
                const reaction = msg.reaction as { emoji?: string } | undefined;
                text = reaction?.emoji ?? null;
              } else if (msgType === "location") {
                attachments.push({
                  type: "location",
                });
              }

              results.push({
                provider: "meta",
                channel: "whatsapp",
                channelType: "whatsapp",
                eventKind,
                externalAccountId: channelAccountId,
                channelAccountId,
                externalThreadId: externalSenderId,
                externalMessageId,
                platformUserId: externalSenderId,
                externalSenderId,
                text,
                attachments,
                timestamp,
                isEcho: false,
                rawEventId: ctx?.rawEventId,
              });
            } catch (msgErr) {
              logger.warn({ msgErr, msgItem }, "Failed to normalize WhatsApp message item");
            }
          }

          // Process message delivery / read statuses
          const statusesList = Array.isArray(value.statuses) ? value.statuses : [];
          for (const statusItem of statusesList) {
            if (!statusItem || typeof statusItem !== "object") continue;
            const status = statusItem as Record<string, unknown>;

            try {
              const statusId = typeof status.id === "string" ? status.id : `status_${Date.now()}`;
              const recipientId =
                typeof status.recipient_id === "string" ? status.recipient_id : "unknown";
              const statusType = typeof status.status === "string" ? status.status : "unknown";
              const timestamp = parseMetaTimestamp(status.timestamp);

              const eventKind =
                statusType === "delivered" ? "delivery" : statusType === "read" ? "read" : "other";

              results.push({
                provider: "meta",
                channel: "whatsapp",
                channelType: "whatsapp",
                eventKind,
                externalAccountId: channelAccountId,
                channelAccountId,
                externalThreadId: recipientId,
                externalMessageId: statusId,
                platformUserId: recipientId,
                externalSenderId: recipientId,
                text: null,
                attachments: [],
                timestamp,
                isEcho: false,
                rawEventId: ctx?.rawEventId,
              });
            } catch (statusErr) {
              logger.warn({ statusErr, statusItem }, "Failed to normalize WhatsApp status item");
            }
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, "Malformed WhatsApp webhook payload");
    }

    return results;
  }

  /**
   * 16 §8 WhatsApp stub in MVP
   */
  send(_input: CanonicalOutbound, _token: string): Promise<SendResult> {
    const whatsappEnabled = env.WHATSAPP_ENABLED === "true";
    if (!whatsappEnabled) {
      return Promise.resolve({
        ok: false,
        retryable: false,
        providerCode: "feature_disabled",
        message: "feature_disabled: WhatsApp Cloud API outbound is disabled in MVP",
      });
    }

    // Phase 2 implementation stub
    return Promise.resolve({
      ok: false,
      retryable: false,
      providerCode: "not_implemented",
      message: "WhatsApp outbound not yet implemented",
    });
  }
}
