import * as crypto from "node:crypto";

import {
  HttpException,
  HttpStatus,
  PayloadTooLargeException,
  UnauthorizedException,
  type ExecutionContext,
} from "@nestjs/common";
import { Channel, ChannelAccountStatus } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { Queue } from "bullmq";

import type { RawBodyRequest } from "../guards/meta-hmac.guard";
import { MetaHmacGuard, MAX_PAYLOAD_BYTES } from "../guards/meta-hmac.guard";
import { WebhooksController } from "./webhooks.controller";
import {
  type MetaWebhookPayload,
  WebhooksService,
  RETRY_WEBHOOK_PROCESSING_JOB,
} from "./webhooks.service";

interface DbChannelAccount {
  id: string;
  business_id: string;
  channel: string;
  external_account_id: string;
  status: string;
  page_id?: string | null;
  ig_user_id?: string | null;
  waba_id?: string | null;
  phone_number_id?: string | null;
  authorized_meta_user_id?: string | null;
  [key: string]: unknown;
}

interface DbIntegrationEvent {
  id: string;
  business_id: string | null;
  channel_account_id: string | null;
  provider: string;
  external_event_id: string | null;
  payload: unknown;
  headers: unknown;
  signature_valid: boolean;
  processed_at: Date | null;
  created_at: Date;
}

describe("Meta Webhooks ingestion & raw payload persistence (T-INT-02)", () => {
  const TEST_SECRET = "test-meta-app-secret-1234567890";
  const TEST_VERIFY_TOKEN = "my-meta-verify-token-xyz";

  let controller: WebhooksController;
  let service: WebhooksService;
  let guard: MetaHmacGuard;

  let mockPrisma: {
    channelAccount: {
      findFirst: jest.Mock;
    };
    integrationEvent: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
  };

  let mockQueue: {
    add: jest.Mock;
    close: jest.Mock;
  };

  let channelAccountsDb: DbChannelAccount[];
  let integrationEventsDb: DbIntegrationEvent[];

  function computeHmacHeader(payload: string | object, secret = TEST_SECRET): string {
    const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
    const hex = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    return `sha256=${hex}`;
  }

  function createSignedRequest(payload: object, secret = TEST_SECRET): string {
    const jsonStr = JSON.stringify(payload);
    const encodedPayload = Buffer.from(jsonStr).toString("base64url");
    const sig = crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
    return `${sig}.${encodedPayload}`;
  }

  beforeEach(() => {
    process.env.META_APP_SECRET = TEST_SECRET;
    process.env.META_WEBHOOK_SECRET = TEST_VERIFY_TOKEN;
    delete process.env.WHATSAPP_ENABLED;

    channelAccountsDb = [
      {
        id: "ca-1",
        business_id: "biz-1",
        channel: Channel.instagram,
        external_account_id: "ig_user_123",
        ig_user_id: "ig_user_123",
        page_id: "page_123",
        status: ChannelAccountStatus.active,
        authorized_meta_user_id: "meta_user_999",
      },
      {
        id: "ca-2",
        business_id: "biz-1",
        channel: Channel.messenger,
        external_account_id: "page_123",
        page_id: "page_123",
        status: ChannelAccountStatus.active,
        authorized_meta_user_id: "meta_user_999",
      },
    ];

    integrationEventsDb = [];

    mockPrisma = {
      channelAccount: {
        findFirst: jest
          .fn()
          .mockImplementation(
            ({ where }: { where: { channel?: string; OR?: Record<string, unknown>[] } }) => {
              let candidates = channelAccountsDb;
              if (where.channel) {
                candidates = candidates.filter((ca) => ca.channel === where.channel);
              }
              if (!where.OR) return Promise.resolve(candidates[0] ?? null);
              for (const condition of where.OR) {
                for (const [key, value] of Object.entries(condition)) {
                  if (value && typeof value === "object" && "in" in value) {
                    const inList = (value as { in: string[] }).in;
                    const found = candidates.find((ca) => inList.includes(ca[key] as string));
                    if (found) return Promise.resolve({ ...found });
                  } else {
                    const found = candidates.find((ca) => ca[key] === value);
                    if (found) return Promise.resolve({ ...found });
                  }
                }
              }
              return Promise.resolve(null);
            },
          ),
      },
      integrationEvent: {
        findFirst: jest.fn().mockImplementation(({ where }: { where: Record<string, unknown> }) => {
          const found = integrationEventsDb.find((e) => {
            if (where.provider && e.provider !== where.provider) return false;
            if (
              "channel_account_id" in where &&
              e.channel_account_id !== where.channel_account_id
            ) {
              return false;
            }
            if (where.external_event_id && e.external_event_id !== where.external_event_id) {
              return false;
            }
            return true;
          });
          return Promise.resolve(found ? { ...found } : null);
        }),
        create: jest
          .fn()
          .mockImplementation(
            ({ data }: { data: Omit<DbIntegrationEvent, "id" | "created_at"> }) => {
              const newEvent: DbIntegrationEvent = {
                id: `evt-${integrationEventsDb.length + 1}`,
                business_id: data.business_id ?? null,
                channel_account_id: data.channel_account_id ?? null,
                provider: data.provider,
                external_event_id: data.external_event_id ?? null,
                payload: data.payload,
                headers: data.headers ?? null,
                signature_valid: data.signature_valid,
                processed_at: data.processed_at ?? null,
                created_at: new Date(),
              };
              integrationEventsDb.push(newEvent);
              return Promise.resolve({ ...newEvent });
            },
          ),
      },
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: "job-1" }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    service = new WebhooksService(
      mockPrisma as unknown as PrismaClient,
      mockQueue as unknown as Queue,
    );
    controller = new WebhooksController(service);
    guard = new MetaHmacGuard();
  });

  describe("1. GET Webhook Challenge Verification (16 §4.1)", () => {
    it("Challenge: GET returns `hub.challenge` matching verify token.", () => {
      const query = {
        "hub.mode": "subscribe",
        "hub.verify_token": TEST_VERIFY_TOKEN,
        "hub.challenge": "CHALLENGE_ACCEPTED_12345",
      };

      const res = controller.verifyWebhookChallenge(query);
      expect(res).toBe("CHALLENGE_ACCEPTED_12345");
    });

    it("rejects with empty 403 Forbidden when verify token does not match", () => {
      const query = {
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong-token",
        "hub.challenge": "CHALLENGE_REJECTED",
      };

      try {
        controller.verifyWebhookChallenge(query);
        fail("Expected HttpException to be thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
        expect((err as HttpException).getResponse()).toBe("");
      }
    });

    it("rejects with empty 403 Forbidden when hub.mode is not 'subscribe'", () => {
      const query = {
        "hub.mode": "publish",
        "hub.verify_token": TEST_VERIFY_TOKEN,
        "hub.challenge": "CHALLENGE_REJECTED",
      };

      try {
        controller.verifyWebhookChallenge(query);
        fail("Expected HttpException to be thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });

    it("supports nested hub query objects from express body/query parsers", () => {
      const query = {
        hub: {
          mode: "subscribe",
          verify_token: TEST_VERIFY_TOKEN,
          challenge: "NESTED_CHALLENGE_OK",
        },
      };

      const res = controller.verifyWebhookChallenge(query);
      expect(res).toBe("NESTED_CHALLENGE_OK");
    });
  });

  describe("2. HMAC Check & MetaHmacGuard (16 §4.2)", () => {
    function createMockExecutionContext(req: Partial<RawBodyRequest>): ExecutionContext {
      return {
        switchToHttp: () => ({
          getRequest: () => req as RawBodyRequest,
          getResponse: () => ({}) as unknown,
          getNext: () => ({}) as unknown,
        }),
      } as unknown as ExecutionContext;
    }

    it("HMAC Check: Invalid HMAC returns 401 Unauthorized without persisting data.", () => {
      const payload = { object: "instagram", entry: [] };
      const req: Partial<RawBodyRequest> = {
        headers: {
          "x-hub-signature-256":
            "sha256=0000000000000000000000000000000000000000000000000000000000000000",
        },
        body: payload,
      };

      const context = createMockExecutionContext(req);
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(mockPrisma.integrationEvent.create).not.toHaveBeenCalled();
    });

    it("returns 401 when X-Hub-Signature-256 header is completely missing", () => {
      const payload = { object: "page", entry: [] };
      const req: Partial<RawBodyRequest> = {
        headers: {},
        body: payload,
      };

      const context = createMockExecutionContext(req);
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it("returns 401 when signature format does not start with sha256=", () => {
      const payload = { object: "page", entry: [] };
      const req: Partial<RawBodyRequest> = {
        headers: {
          "x-hub-signature-256": "md5=12345",
        },
        body: payload,
      };

      const context = createMockExecutionContext(req);
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it("returns 413 Payload Too Large when Content-Length exceeds 512 KB", () => {
      const req: Partial<RawBodyRequest> = {
        headers: {
          "content-length": String(MAX_PAYLOAD_BYTES + 10),
          "x-hub-signature-256": "sha256=123",
        },
        body: {},
      };

      const context = createMockExecutionContext(req);
      expect(() => guard.canActivate(context)).toThrow(PayloadTooLargeException);
    });

    it("returns 413 Payload Too Large when buffered body exceeds 512 KB", () => {
      const largeBuffer = Buffer.alloc(MAX_PAYLOAD_BYTES + 10);
      const req: Partial<RawBodyRequest> = {
        headers: {
          "x-hub-signature-256": "sha256=123",
        },
        body: largeBuffer,
      };

      const context = createMockExecutionContext(req);
      expect(() => guard.canActivate(context)).toThrow(PayloadTooLargeException);
    });

    it("passes guard when signature is cryptographically valid", () => {
      const payload = { object: "instagram", entry: [{ id: "ig_user_123" }] };
      const rawString = JSON.stringify(payload);
      const sig = computeHmacHeader(rawString);

      const req: Partial<RawBodyRequest> = {
        headers: {
          "x-hub-signature-256": sig,
        },
        body: payload,
        rawBody: Buffer.from(rawString),
      };

      const context = createMockExecutionContext(req);
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe("3. Fast 200 & Raw Payload Ingestion (16 §4.3)", () => {
    it.each([
      ["instagram", "instagram"],
      ["page", "messenger"],
      ["whatsapp_business_account", "whatsapp"],
    ])(
      "maps Graph object %s to a real Channel enum member (%s)",
      async (objectType: string, expectedChannel: string) => {
        // Regression guard: the mapping used to return uppercase literals behind
        // an `as Channel` cast. That type-checked but Prisma rejected it with
        // PrismaClientValidationError, so every `page` webhook returned 500.
        // Asserting against the generated enum makes a rename a compile error.
        expect(Object.values(Channel)).toContain(expectedChannel);

        const payload: MetaWebhookPayload = {
          object: objectType,
          entry: [{ id: "acct_1", time: 1700000000 }],
        };
        const rawString = JSON.stringify(payload);

        if (objectType === "whatsapp_business_account") {
          process.env.WHATSAPP_ENABLED = "true";
        }

        mockPrisma.channelAccount.findFirst.mockClear();
        await controller.handleMetaWebhook(payload, {
          headers: { "x-hub-signature-256": computeHmacHeader(rawString) },
          body: payload,
          rawBody: Buffer.from(rawString),
        });

        const call = mockPrisma.channelAccount.findFirst.mock.calls[0]?.[0] as
          | { where?: { channel?: string } }
          | undefined;
        expect(call?.where?.channel).toBe(expectedChannel);
        expect(Object.values(Channel)).toContain(call?.where?.channel);

        delete process.env.WHATSAPP_ENABLED;
      },
    );

    it("Fast 200: Valid webhook persists raw event and returns 200 OK immediately.", async () => {
      const payload: MetaWebhookPayload = {
        object: "instagram",
        entry: [
          {
            id: "ig_user_123",
            time: 1700000000,
            messaging: [
              {
                sender: { id: "customer_99" },
                recipient: { id: "ig_user_123" },
                message: {
                  mid: "mid.1234567890",
                  text: "Hello from customer",
                },
              },
            ],
          },
        ],
      };

      const rawString = JSON.stringify(payload);
      const req: Partial<RawBodyRequest> = {
        headers: {
          "x-hub-signature-256": computeHmacHeader(rawString),
        },
        body: payload,
        rawBody: Buffer.from(rawString),
      };

      const res = await controller.handleMetaWebhook(payload, req as RawBodyRequest);

      expect(res.ok).toBe(true);

      // Verify event was saved to integration_events with null processed_at
      expect(mockPrisma.integrationEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            business_id: "biz-1",
            channel_account_id: "ca-1",
            provider: "meta",
            external_event_id: "ig_user_123_mid.1234567890",
            signature_valid: true,
            processed_at: null,
          }),
        }),
      );

      // Verify BullMQ job was enqueued
      expect(mockQueue.add).toHaveBeenCalledWith(
        RETRY_WEBHOOK_PROCESSING_JOB,
        { integrationEventId: "evt-1" },
        expect.objectContaining({
          jobId: "evt-1",
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
        }),
      );
    });

    it("correctly routes object=page to MESSENGER channel account", async () => {
      const payload: MetaWebhookPayload = {
        object: "page",
        entry: [
          {
            id: "page_123",
            messaging: [
              {
                sender: { id: "customer_page_user" },
                recipient: { id: "page_123" },
                message: { mid: "m_page_msg_1", text: "Hello Messenger" },
              },
            ],
          },
        ],
      };

      const rawString = JSON.stringify(payload);
      const req: Partial<RawBodyRequest> = {
        headers: { "x-hub-signature-256": computeHmacHeader(rawString) },
        body: payload,
        rawBody: Buffer.from(rawString),
      };

      const res = await controller.handleMetaWebhook(payload, req as RawBodyRequest);

      expect(res.ok).toBe(true);
      expect(mockPrisma.integrationEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            business_id: "biz-1",
            channel_account_id: "ca-2", // ca-2 is MESSENGER
          }),
        }),
      );
    });

    it("persists unknown channel account event with processed_at=now and no BullMQ job", async () => {
      const payload: MetaWebhookPayload = {
        object: "page",
        entry: [
          {
            id: "unknown_page_9999",
            messaging: [
              {
                sender: { id: "user_x" },
                recipient: { id: "unknown_page_9999" },
                message: { mid: "m_unknown_1", text: "Test" },
              },
            ],
          },
        ],
      };

      const rawString = JSON.stringify(payload);
      const req: Partial<RawBodyRequest> = {
        headers: { "x-hub-signature-256": computeHmacHeader(rawString) },
        body: payload,
        rawBody: Buffer.from(rawString),
      };

      const res = await controller.handleMetaWebhook(payload, req as RawBodyRequest);

      expect(res.ok).toBe(true);

      expect(mockPrisma.integrationEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            business_id: null,
            channel_account_id: null,
            provider: "meta",
            processed_at: expect.any(Date),
          }),
        }),
      );

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it("ignores whatsapp_business_account object when WHATSAPP_ENABLED flag is off", async () => {
      process.env.WHATSAPP_ENABLED = "false";

      const payload: MetaWebhookPayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "waba_1",
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "phone_1" },
                  messages: [{ id: "wam_1", from: "123", text: { body: "Hi" } }],
                },
              },
            ],
          },
        ],
      };

      const rawString = JSON.stringify(payload);
      const req: Partial<RawBodyRequest> = {
        headers: { "x-hub-signature-256": computeHmacHeader(rawString) },
        body: payload,
        rawBody: Buffer.from(rawString),
      };

      const res = await controller.handleMetaWebhook(payload, req as RawBodyRequest);

      expect(res.ok).toBe(true);
      expect(mockPrisma.integrationEvent.create).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it("ignores unsupported Graph objects silently without writing to DB", async () => {
      const payload = {
        object: "unsupported_custom_object",
        entry: [],
      } as unknown as MetaWebhookPayload;

      const rawString = JSON.stringify(payload);
      const req: Partial<RawBodyRequest> = {
        headers: { "x-hub-signature-256": computeHmacHeader(rawString) },
        body: payload,
        rawBody: Buffer.from(rawString),
      };

      const res = await controller.handleMetaWebhook(payload, req as RawBodyRequest);

      expect(res.ok).toBe(true);
      expect(mockPrisma.integrationEvent.create).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  describe("4. Duplicate Idempotency & Deduplication (16 §4.3)", () => {
    it("Duplicate Idempotency: Duplicate external message IDs are deduplicated safely.", async () => {
      const payload: MetaWebhookPayload = {
        object: "instagram",
        entry: [
          {
            id: "ig_user_123",
            messaging: [
              {
                message: { mid: "m_duplicate_1" },
              },
            ],
          },
        ],
      };

      // 1. Pre-seed already processed event in database
      integrationEventsDb.push({
        id: "evt-existing-done",
        business_id: "biz-1",
        channel_account_id: "ca-1",
        provider: "meta",
        external_event_id: "ig_user_123_m_duplicate_1",
        payload,
        headers: null,
        signature_valid: true,
        processed_at: new Date(),
        created_at: new Date(),
      });

      const rawString = JSON.stringify(payload);
      const req: Partial<RawBodyRequest> = {
        headers: { "x-hub-signature-256": computeHmacHeader(rawString) },
        body: payload,
        rawBody: Buffer.from(rawString),
      };

      const res = await controller.handleMetaWebhook(payload, req as RawBodyRequest);

      expect(res.ok).toBe(true);

      // No new row created, no queue re-push
      expect(mockPrisma.integrationEvent.create).not.toHaveBeenCalled();
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it("re-enqueues duplicate event if processed_at is still null (in-flight retry)", async () => {
      const payload: MetaWebhookPayload = {
        object: "instagram",
        entry: [
          {
            id: "ig_user_123",
            messaging: [
              {
                message: { mid: "m_in_flight_1" },
              },
            ],
          },
        ],
      };

      // Pre-seed event with null processed_at
      integrationEventsDb.push({
        id: "evt-in-flight",
        business_id: "biz-1",
        channel_account_id: "ca-1",
        provider: "meta",
        external_event_id: "ig_user_123_m_in_flight_1",
        payload,
        headers: null,
        signature_valid: true,
        processed_at: null,
        created_at: new Date(),
      });

      const rawString = JSON.stringify(payload);
      const req: Partial<RawBodyRequest> = {
        headers: { "x-hub-signature-256": computeHmacHeader(rawString) },
        body: payload,
        rawBody: Buffer.from(rawString),
      };

      const res = await controller.handleMetaWebhook(payload, req as RawBodyRequest);

      expect(res.ok).toBe(true);

      // No new row created, but re-enqueued with same eventId
      expect(mockPrisma.integrationEvent.create).not.toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith(
        RETRY_WEBHOOK_PROCESSING_JOB,
        { integrationEventId: "evt-in-flight" },
        expect.objectContaining({ jobId: "evt-in-flight" }),
      );
    });

    it("deduplicates unknown account webhooks by (provider, external_event_id)", async () => {
      const payload: MetaWebhookPayload = {
        object: "page",
        entry: [
          {
            id: "unknown_page_4444",
            messaging: [
              {
                message: { mid: "m_unknown_dedupe" },
              },
            ],
          },
        ],
      };

      integrationEventsDb.push({
        id: "evt-unknown-done",
        business_id: null,
        channel_account_id: null,
        provider: "meta",
        external_event_id: "unknown_page_4444_m_unknown_dedupe",
        payload,
        headers: null,
        signature_valid: true,
        processed_at: new Date(),
        created_at: new Date(),
      });

      const rawString = JSON.stringify(payload);
      const req: Partial<RawBodyRequest> = {
        headers: { "x-hub-signature-256": computeHmacHeader(rawString) },
        body: payload,
        rawBody: Buffer.from(rawString),
      };

      const res = await controller.handleMetaWebhook(payload, req as RawBodyRequest);

      expect(res.ok).toBe(true);
      expect(mockPrisma.integrationEvent.create).not.toHaveBeenCalled();
    });
  });

  describe("5. Meta App Deauthorization Callback (16 §4.5)", () => {
    it("processes valid signed_request, persists event, and enqueues worker", async () => {
      const deauthPayload = {
        user_id: "meta_user_999",
        algorithm: "HMAC-SHA256",
        issued_at: 1700000000,
      };
      const signedRequest = createSignedRequest(deauthPayload);

      const req: Partial<RawBodyRequest> = {
        headers: {},
        body: { signed_request: signedRequest },
      };

      const res = await controller.handleDeauthorize(
        { signed_request: signedRequest },
        req as RawBodyRequest,
      );

      expect(res.ok).toBe(true);
      expect(mockPrisma.integrationEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            business_id: "biz-1",
            channel_account_id: "ca-1",
            provider: "meta",
            signature_valid: true,
            processed_at: null,
          }),
        }),
      );
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it("rejects invalid signed_request signature with 401 Unauthorized", async () => {
      const deauthPayload = { user_id: "meta_user_999" };
      const signedRequest = createSignedRequest(deauthPayload, "wrong-secret");

      const req: Partial<RawBodyRequest> = {
        headers: {},
        body: { signed_request: signedRequest },
      };

      await expect(
        controller.handleDeauthorize({ signed_request: signedRequest }, req as RawBodyRequest),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrisma.integrationEvent.create).not.toHaveBeenCalled();
    });
  });
});
