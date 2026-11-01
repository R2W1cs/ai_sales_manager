import { Injectable } from "@nestjs/common";

import type { CanonicalOutbound, SendResult } from "@app/shared";
import { env } from "@app/shared/server";

import { logger } from "../../lib/logger";

export interface MetaApiErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    is_transient?: boolean;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
  };
}

export interface MetaApiSuccessResponse {
  message_id?: string;
  recipient_id?: string;
  messages?: { id: string }[];
  contacts?: { wa_id: string; input: string }[];
}

@Injectable()
export class MetaApiClient {
  private readonly graphVersion: string;

  constructor() {
    this.graphVersion = env.META_GRAPH_VERSION;
  }

  /**
   * Dispatches outbound message via Meta Graph API or WhatsApp Cloud API.
   * 16 §6: Uses undici/fetch with 10s timeout and transient error classification.
   */
  async sendMessage(input: CanonicalOutbound, token: string): Promise<SendResult> {
    if (!token) {
      return {
        ok: false,
        retryable: false,
        message: `Missing access token for ${input.channel} dispatch`,
      };
    }

    if (input.channel === "whatsapp") {
      return this.sendWhatsAppMessage(input, token);
    }

    return this.sendGraphMessage(input, token);
  }

  /**
   * 16 §6.1 Instagram Direct & Facebook Messenger Graph API outbound dispatcher.
   */
  async sendGraphMessage(input: CanonicalOutbound, token: string): Promise<SendResult> {
    const target = input.pageId ? `${input.pageId}/messages` : "me/messages";
    const url = `https://graph.facebook.com/${this.graphVersion}/${target}`;

    const bodyPayload: Record<string, unknown> = {
      recipient: { id: input.recipientPlatformUserId },
      messaging_type: "RESPONSE",
    };

    const imageUrl = input.imageUrl || input.imageS3Key;

    if (input.text) {
      bodyPayload.message = { text: input.text };
    } else if (imageUrl) {
      bodyPayload.message = {
        attachment: {
          type: "image",
          payload: { url: imageUrl, is_reusable: true },
        },
      };
    } else {
      return {
        ok: false,
        retryable: false,
        message: "Message payload has neither text nor attachment",
      };
    }

    return this.executeHttpRequest(url, bodyPayload, token, input.channel);
  }

  /**
   * WhatsApp Cloud API outbound dispatcher.
   */
  async sendWhatsAppMessage(input: CanonicalOutbound, token: string): Promise<SendResult> {
    const phoneNumberId = input.pageId ?? env.META_WA_PHONE_NUMBER_ID ?? "me";
    const url = `https://graph.facebook.com/${this.graphVersion}/${phoneNumberId}/messages`;

    const bodyPayload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: input.recipientPlatformUserId,
    };

    const imageUrl = input.imageUrl || input.imageS3Key;

    if (input.text) {
      bodyPayload.type = "text";
      bodyPayload.text = { body: input.text };
    } else if (imageUrl) {
      bodyPayload.type = "image";
      bodyPayload.image = { link: imageUrl };
    } else {
      return {
        ok: false,
        retryable: false,
        message: "WhatsApp payload has neither text nor media link",
      };
    }

    return this.executeHttpRequest(url, bodyPayload, token, "whatsapp");
  }

  /**
   * Executes HTTP POST with 10s timeout and classifies transient vs fatal Meta errors.
   */
  private async executeHttpRequest(
    url: string,
    body: Record<string, unknown>,
    token: string,
    channel: string,
  ): Promise<SendResult> {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000), // 16 §6: 10s per Graph call
      });

      const responseText = await response.text();
      let data: (MetaApiSuccessResponse & MetaApiErrorResponse) | null = null;
      try {
        data = JSON.parse(responseText) as MetaApiSuccessResponse & MetaApiErrorResponse;
      } catch {
        // Raw non-JSON response (e.g. 502/504 gateway error from proxy)
      }

      if (!response.ok) {
        const statusCode = response.status;
        const metaError = data?.error;
        const errorCode = metaError?.code;

        // Rate limit codes: 429 HTTP, #4 Meta rate limit, #17 Meta user limit
        const isRateLimit = statusCode === 429 || errorCode === 4 || errorCode === 17;

        // Transient codes: 5xx server errors, rate limits, or is_transient flag
        const isTransient = statusCode >= 500 || isRateLimit || Boolean(metaError?.is_transient);

        const errorMessage =
          metaError?.message ||
          `Meta API request failed with status ${statusCode.toString()}: ${responseText || response.statusText}`;

        logger.warn(
          { channel, statusCode, errorCode, isTransient, errorMessage },
          `Meta API outbound dispatch failed`,
        );

        return {
          ok: false,
          retryable: isTransient,
          providerCode: errorCode ? String(errorCode) : String(statusCode),
          message: errorMessage,
        };
      }

      // Successful dispatch
      const externalMessageId = data?.message_id || data?.messages?.[0]?.id || undefined;

      if (!externalMessageId) {
        logger.warn(
          { channel, data, responseText },
          "Meta API returned HTTP 200 without message_id or messages[0].id",
        );
      }

      return {
        ok: true,
        externalMessageId,
      };
    } catch (err: unknown) {
      const isAbortOrTimeout =
        err instanceof Error &&
        (err.name === "TimeoutError" ||
          err.name === "AbortError" ||
          err.message.includes("timed out"));

      logger.warn({ channel, err, isAbortOrTimeout }, `Meta API network or timeout error`);

      return {
        ok: false,
        retryable: true, // Network errors & timeouts are transient and retryable
        message: err instanceof Error ? err.message : `Network error calling ${channel} Graph API`,
      };
    }
  }
}
