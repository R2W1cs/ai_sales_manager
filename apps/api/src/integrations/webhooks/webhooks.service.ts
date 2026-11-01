import * as crypto from "node:crypto";

import {
  HttpException,
  HttpStatus,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import { Channel } from "@prisma/client";
import { Queue } from "bullmq";

import { env } from "@app/shared/server";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { connection } from "../../lib/queue";

export const INTEGRATIONS_QUEUE_NAME = "integrations";
export const RETRY_WEBHOOK_PROCESSING_JOB = "retry_webhook_processing";

export interface WebhookJobData {
  integrationEventId: string;
}

export interface MetaWebhookPayload {
  object: string;
  entry?: {
    id?: string;
    time?: number;
    messaging?: {
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: {
        mid?: string;
        text?: string;
        attachments?: unknown[];
        is_echo?: boolean;
      };
      delivery?: unknown;
      read?: unknown;
      postback?: unknown;
    }[];
    changes?: {
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        messages?: {
          id?: string;
          from?: string;
          timestamp?: string;
          text?: { body?: string };
          type?: string;
        }[];
        statuses?: unknown[];
      };
    }[];
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
}

export interface DeauthorizePayload {
  user_id?: string;
  algorithm?: string;
  issued_at?: number;
  [key: string]: unknown;
}

@Injectable()
export class WebhooksService implements OnModuleInit, OnModuleDestroy {
  private readonly prisma: PrismaClient;
  private queue: Queue<WebhookJobData> | null = null;

  constructor(@Optional() prismaClient?: PrismaClient, @Optional() queue?: Queue<WebhookJobData>) {
    this.prisma = prismaClient ?? prisma;
    this.queue = queue ?? null;
  }

  private getOrCreateQueue(): Queue<WebhookJobData> {
    if (!this.queue) {
      try {
        this.queue = new Queue<WebhookJobData>(INTEGRATIONS_QUEUE_NAME, {
          connection,
        });
      } catch (err) {
        logger.error({ err }, "Could not initialize BullMQ queue for integrations webhooks");
        throw err;
      }
    }
    return this.queue;
  }

  onModuleInit() {
    try {
      this.getOrCreateQueue();
    } catch (err) {
      logger.warn({ err }, "Deferred BullMQ queue initialization for integrations webhooks");
    }
  }

  async onModuleDestroy() {
    if (this.queue) {
      try {
        await this.queue.close();
      } catch (err) {
        logger.warn({ err }, "Error closing integrations BullMQ queue");
      }
    }
  }

  /**
   * 16 §4.1 / 13 §10.3 GET /webhooks/meta verification challenge.
   * Responds with 200 hub.challenge or empty 403.
   */
  verifyChallenge(query: Record<string, unknown>): string {
    const hubObj =
      typeof query.hub === "object" && query.hub !== null
        ? (query.hub as Record<string, unknown>)
        : undefined;

    const mode =
      typeof query["hub.mode"] === "string"
        ? query["hub.mode"]
        : typeof hubObj?.mode === "string"
          ? hubObj.mode
          : typeof query.mode === "string"
            ? query.mode
            : undefined;

    const verifyToken =
      typeof query["hub.verify_token"] === "string"
        ? query["hub.verify_token"]
        : typeof hubObj?.verify_token === "string"
          ? hubObj.verify_token
          : typeof query.verify_token === "string"
            ? query.verify_token
            : undefined;

    const challenge =
      typeof query["hub.challenge"] === "string"
        ? query["hub.challenge"]
        : typeof hubObj?.challenge === "string"
          ? hubObj.challenge
          : typeof query.challenge === "string"
            ? query.challenge
            : "";

    const expectedToken = env.META_WEBHOOK_SECRET ?? "";

    if (
      mode === "subscribe" &&
      typeof verifyToken === "string" &&
      verifyToken.length > 0 &&
      expectedToken.length > 0 &&
      verifyToken.length === expectedToken.length &&
      crypto.timingSafeEqual(Buffer.from(verifyToken), Buffer.from(expectedToken))
    ) {
      return challenge;
    }

    // Spec: 16 §4.1 / 13 §10.3 -> 403 empty
    throw new HttpException("", HttpStatus.FORBIDDEN);
  }

  /**
   * Helper extracting candidate account identifiers from Meta webhook payload.
   */
  private extractCandidateIds(payload: MetaWebhookPayload): string[] {
    const ids = new Set<string>();

    if (!payload.entry || !Array.isArray(payload.entry)) {
      return [];
    }

    for (const entry of payload.entry) {
      if (entry.id) {
        ids.add(entry.id);
      }

      if (entry.messaging && Array.isArray(entry.messaging)) {
        for (const msg of entry.messaging) {
          if (msg.recipient?.id) ids.add(msg.recipient.id);
          if (msg.sender?.id) ids.add(msg.sender.id);
        }
      }

      if (entry.changes && Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          const meta = change.value?.metadata;
          if (meta?.phone_number_id) ids.add(meta.phone_number_id);
          if (meta?.display_phone_number) ids.add(meta.display_phone_number);
        }
      }
    }

    return Array.from(ids);
  }

  /**
   * Resolves target Channel filter matching Graph object (16 §4.3).
   *
   * Uses the generated `Channel` enum members rather than string literals: the
   * schema values are lowercase, and hand-written uppercase literals behind an
   * `as Channel` cast type-checked while failing at runtime with
   * `PrismaClientValidationError` on every `page` webhook.
   */
  private mapObjectToChannel(objectType: string): Channel | undefined {
    switch (objectType) {
      case "instagram":
        return Channel.instagram;
      case "page":
        return Channel.messenger;
      case "whatsapp_business_account":
        return Channel.whatsapp;
      default:
        return undefined;
    }
  }

  /**
   * Computes idempotent external event ID from entry ID + first mid or raw payload hash.
   */
  private computeExternalEventId(payload: MetaWebhookPayload, rawBody?: Buffer): string {
    const firstEntry = payload.entry?.[0];
    const firstMsg = firstEntry?.messaging?.[0];
    const firstChangeMsg = firstEntry?.changes?.[0]?.value?.messages?.[0];

    if (firstEntry?.id && firstMsg?.message?.mid) {
      return `${firstEntry.id}_${firstMsg.message.mid}`;
    }

    if (firstEntry?.id && firstChangeMsg?.id) {
      return `${firstEntry.id}_${firstChangeMsg.id}`;
    }

    const payloadBuffer = rawBody ?? Buffer.from(JSON.stringify(payload));
    if (firstEntry?.id) {
      const hash = crypto.createHash("sha256").update(payloadBuffer).digest("hex").slice(0, 16);
      return `${firstEntry.id}_${hash}`;
    }

    return crypto.createHash("sha256").update(payloadBuffer).digest("hex");
  }

  /**
   * Enqueues retry_webhook_processing BullMQ job.
   */
  async enqueueWebhookJob(integrationEventId: string): Promise<void> {
    const queue = this.getOrCreateQueue();
    try {
      await queue.add(
        RETRY_WEBHOOK_PROCESSING_JOB,
        { integrationEventId },
        {
          jobId: integrationEventId,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
        },
      );
    } catch (err) {
      logger.error({ err, integrationEventId }, "Failed to enqueue webhook processing job");
      throw err;
    }
  }

  /**
   * 16 §4.3 Main Webhook Ingestion & Persistence Handler.
   */
  async handleWebhook(
    payload: MetaWebhookPayload,
    rawBody?: Buffer,
    headers?: Record<string, unknown>,
  ): Promise<{ ok: boolean }> {
    const objectType = payload.object;

    // Case 1: WhatsApp payload with feature flag off -> 200, no insert, no enqueue
    if (objectType === "whatsapp_business_account") {
      const whatsappEnabled = env.WHATSAPP_ENABLED === "true";
      if (!whatsappEnabled) {
        return { ok: true };
      }
    }

    // Case 2: Unknown Graph object -> 200, no insert, no enqueue
    const allowedObjects = new Set([
      "page",
      "instagram",
      "permissions",
      "whatsapp_business_account",
    ]);
    if (!allowedObjects.has(objectType)) {
      return { ok: true };
    }

    const candidateIds = this.extractCandidateIds(payload);
    const channelFilter = this.mapObjectToChannel(objectType);

    const channelAccount =
      candidateIds.length > 0
        ? await this.prisma.channelAccount.findFirst({
            where: {
              ...(channelFilter ? { channel: channelFilter } : {}),
              OR: [
                { external_account_id: { in: candidateIds } },
                { page_id: { in: candidateIds } },
                { ig_user_id: { in: candidateIds } },
                { waba_id: { in: candidateIds } },
                { phone_number_id: { in: candidateIds } },
                { authorized_meta_user_id: { in: candidateIds } },
              ],
            },
          })
        : null;

    const externalEventId = this.computeExternalEventId(payload, rawBody);

    // Case 3: Valid object but no matching channel_account -> 200, insert with processed_at=now, no enqueue
    if (!channelAccount) {
      // Deduplicate unknown account rows by (provider, external_event_id)
      const existingUnknown = await this.prisma.integrationEvent.findFirst({
        where: {
          provider: "meta",
          channel_account_id: null,
          external_event_id: externalEventId,
        },
      });

      if (existingUnknown) {
        return { ok: true };
      }

      await this.prisma.integrationEvent.create({
        data: {
          business_id: null,
          channel_account_id: null,
          provider: "meta",
          external_event_id: externalEventId,
          payload: payload as unknown as Prisma.InputJsonValue,
          headers: headers ? (headers as unknown as Prisma.InputJsonValue) : undefined,
          signature_valid: true,
          processed_at: new Date(),
        },
      });

      return { ok: true };
    }

    // Case 4: Matching channel_account found -> check duplicate / idempotency
    const existing = await this.prisma.integrationEvent.findFirst({
      where: {
        provider: "meta",
        channel_account_id: channelAccount.id,
        external_event_id: externalEventId,
      },
    });

    if (existing) {
      if (existing.processed_at !== null) {
        // Already processed -> 200 no-op
        return { ok: true };
      }

      // Duplicate in-flight -> re-enqueue same jobId and 200
      await this.enqueueWebhookJob(existing.id);
      return { ok: true };
    }

    // Insert new event row
    const event = await this.prisma.integrationEvent.create({
      data: {
        business_id: channelAccount.business_id,
        channel_account_id: channelAccount.id,
        provider: "meta",
        external_event_id: externalEventId,
        payload: payload as unknown as Prisma.InputJsonValue,
        headers: headers ? (headers as unknown as Prisma.InputJsonValue) : undefined,
        signature_valid: true,
        processed_at: null,
      },
    });

    // Enqueue retry_webhook_processing (14 §4)
    await this.enqueueWebhookJob(event.id);

    return { ok: true };
  }

  /**
   * 16 §4.5 Deauthorize Callback (signed_request).
   */
  async handleDeauthorize(
    signedRequest?: string,
    headers?: Record<string, unknown>,
  ): Promise<{ ok: boolean }> {
    if (!signedRequest) {
      throw new UnauthorizedException({
        error: {
          code: "webhook_invalid_signature",
          message: "Missing signed_request in deauthorize payload",
        },
      });
    }

    const appSecret = env.META_APP_SECRET ?? "";
    const parsed = this.parseSignedRequest(signedRequest, appSecret);

    if (!parsed?.user_id) {
      throw new UnauthorizedException({
        error: {
          code: "webhook_invalid_signature",
          message: "Invalid signed_request signature or payload",
        },
      });
    }

    const userId = parsed.user_id;
    const channelAccount = await this.prisma.channelAccount.findFirst({
      where: {
        OR: [{ authorized_meta_user_id: userId }, { external_account_id: userId }],
      },
    });

    const externalEventId = `deauth_${userId}_${parsed.issued_at || Date.now()}`;

    if (!channelAccount) {
      await this.prisma.integrationEvent.create({
        data: {
          business_id: null,
          channel_account_id: null,
          provider: "meta",
          external_event_id: externalEventId,
          payload: parsed as unknown as Prisma.InputJsonValue,
          headers: headers ? (headers as unknown as Prisma.InputJsonValue) : undefined,
          signature_valid: true,
          processed_at: new Date(),
        },
      });
      return { ok: true };
    }

    const event = await this.prisma.integrationEvent.create({
      data: {
        business_id: channelAccount.business_id,
        channel_account_id: channelAccount.id,
        provider: "meta",
        external_event_id: externalEventId,
        payload: parsed as unknown as Prisma.InputJsonValue,
        headers: headers ? (headers as unknown as Prisma.InputJsonValue) : undefined,
        signature_valid: true,
        processed_at: null,
      },
    });

    await this.enqueueWebhookJob(event.id);
    return { ok: true };
  }

  /**
   * Helper parsing and verifying Meta signed_request.
   */
  private parseSignedRequest(signedRequest: string, secret: string): DeauthorizePayload | null {
    const parts = signedRequest.split(".");
    if (parts.length !== 2) {
      return null;
    }

    const [encodedSig, encodedPayload] = parts;
    if (!encodedSig || !encodedPayload) {
      return null;
    }

    try {
      const sig = Buffer.from(encodedSig.replace(/-/g, "+").replace(/_/g, "/"), "base64");
      const calculatedSig = crypto.createHmac("sha256", secret).update(encodedPayload).digest();

      if (sig.length === 0 || calculatedSig.length === 0 || sig.length !== calculatedSig.length) {
        return null;
      }

      if (!crypto.timingSafeEqual(sig, calculatedSig)) {
        return null;
      }

      const payloadJson = Buffer.from(
        encodedPayload.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8");

      return JSON.parse(payloadJson) as DeauthorizePayload;
    } catch {
      return null;
    }
  }
}
