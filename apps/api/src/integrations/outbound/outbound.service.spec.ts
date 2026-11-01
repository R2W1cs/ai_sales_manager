import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
/* oxlint-disable typescript/unbound-method */
import type { PrismaClient } from "@prisma/client";
import { type Queue, type Job, UnrecoverableError } from "bullmq";

import { MetaApiClient } from "../meta/meta-api.client";
import { MetaOAuthService } from "../meta/meta-oauth.service";
import { OutboundProcessor } from "./outbound.processor";
import { OutboundService, DELIVER_OUTBOUND_JOB } from "./outbound.service";

jest.mock("../../lib/storage", () => ({
  getDownloadUrl: jest
    .fn()
    .mockImplementation((key: string) => Promise.resolve(`https://s3.signed.url/${key}?sig=test`)),
  getPublicUrl: jest.fn().mockImplementation((key: string) => `https://s3.public.url/${key}`),
}));

describe("Outbound message delivery pipeline, rate limiting & retry queue (T-INT-04)", () => {
  let outboundService: OutboundService;
  let outboundProcessor: OutboundProcessor;
  let metaApiClient: MetaApiClient;
  let metaOAuthService: MetaOAuthService;
  let mockPrisma: any;
  let mockQueue: jest.Mocked<Queue>;

  const mockBusinessId = "biz-1111-2222-3333";
  const mockMessageId = "msg-4444-5555-6666";
  const mockChannelAccountId = "ca-7777-8888-9999";
  const mockPlainToken = "EAABmockAccessToken123456789";

  beforeEach(() => {
    metaOAuthService = new MetaOAuthService();

    mockPrisma = {
      message: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      channelAccount: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: mockMessageId } as any),
      getJob: jest.fn().mockResolvedValue(null),
      getWaitingCount: jest.fn().mockResolvedValue(0),
      getActiveCount: jest.fn().mockResolvedValue(0),
      getCompletedCount: jest.fn().mockResolvedValue(5),
      getFailedCount: jest.fn().mockResolvedValue(1),
      getDelayedCount: jest.fn().mockResolvedValue(0),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Queue>;

    metaApiClient = new MetaApiClient();

    outboundService = new OutboundService(mockPrisma as PrismaClient, mockQueue);
    outboundProcessor = new OutboundProcessor(
      metaApiClient,
      metaOAuthService,
      mockPrisma as PrismaClient,
      mockQueue,
    );
  });

  describe("OutboundService.queueMessage", () => {
    it("pushes outbound message job to BullMQ deliver_outbound queue with messageId as jobId", async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: mockMessageId,
        business_id: mockBusinessId,
        channel_account_id: mockChannelAccountId,
        delivery_status: "queued",
        external_message_id: null,
      });

      const result = await outboundService.queueMessage(mockMessageId);

      expect(result.queued).toBe(true);
      expect(result.messageId).toBe(mockMessageId);
      expect(result.jobId).toBe(mockMessageId);

      expect(mockQueue.add).toHaveBeenCalledWith(
        DELIVER_OUTBOUND_JOB,
        expect.objectContaining({
          messageId: mockMessageId,
          businessId: mockBusinessId,
          channelAccountId: mockChannelAccountId,
        }),
        expect.objectContaining({
          jobId: mockMessageId,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
        }),
      );
    });

    it("removes existing failed/completed BullMQ job before re-enqueuing to avoid duplicate jobId rejection", async () => {
      const mockExistingJob = {
        remove: jest.fn().mockResolvedValue(undefined),
      };
      mockQueue.getJob.mockResolvedValue(mockExistingJob as any);

      mockPrisma.message.findUnique.mockResolvedValue({
        id: mockMessageId,
        business_id: mockBusinessId,
        channel_account_id: mockChannelAccountId,
        delivery_status: "queued",
        external_message_id: null,
      });

      const result = await outboundService.queueMessage(mockMessageId);

      expect(result.queued).toBe(true);
      expect(mockQueue.getJob).toHaveBeenCalledWith(mockMessageId);
      expect(mockExistingJob.remove).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it("throws ServiceUnavailableException when queue is not connected/initialized", async () => {
      const disconnectedService = new OutboundService(mockPrisma as PrismaClient, null as any);

      mockPrisma.message.findUnique.mockResolvedValue({
        id: mockMessageId,
        business_id: mockBusinessId,
        channel_account_id: mockChannelAccountId,
        delivery_status: "pending",
        external_message_id: null,
      });

      await expect(disconnectedService.queueMessage(mockMessageId)).rejects.toThrow(
        ServiceUnavailableException,
      );

      // Verify DB status was NOT updated to 'queued' when queue is unavailable
      expect(mockPrisma.message.update).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when messageId does not exist in DB", async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(outboundService.queueMessage("non-existent-id")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws BadRequestException when message is in 'draft' status", async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: mockMessageId,
        business_id: mockBusinessId,
        delivery_status: "draft",
      });

      await expect(outboundService.queueMessage(mockMessageId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("skips queueing if message is already 'sent' or 'delivered'", async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: mockMessageId,
        business_id: mockBusinessId,
        delivery_status: "sent",
        external_message_id: "mid.existing.123",
      });

      const result = await outboundService.queueMessage(mockMessageId);

      expect(result.queued).toBe(false);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it("re-queues a failed message via retryMessage", async () => {
      mockPrisma.message.findFirst.mockResolvedValue({
        id: mockMessageId,
        business_id: mockBusinessId,
        delivery_status: "failed",
      });
      mockPrisma.message.findUnique.mockResolvedValue({
        id: mockMessageId,
        business_id: mockBusinessId,
        delivery_status: "queued",
      });
      mockPrisma.message.update.mockResolvedValue({
        id: mockMessageId,
        delivery_status: "queued",
      });

      const result = await outboundService.retryMessage(mockBusinessId, mockMessageId);

      expect(result.queued).toBe(true);
      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: mockMessageId },
        data: { delivery_status: "queued" },
      });
    });

    it("returns queue stats from BullMQ", async () => {
      const stats = await outboundService.getQueueStats();
      expect(stats.completed).toBe(5);
      expect(stats.failed).toBe(1);
    });
  });

  describe("OutboundProcessor — Acceptance Criteria", () => {
    it("Outbound Delivery: Message dispatches to Meta API and updates delivery status to SENT.", async () => {
      const encryptedToken = metaOAuthService.encryptToken(mockPlainToken);

      mockPrisma.message.findUnique.mockResolvedValue({
        id: mockMessageId,
        business_id: mockBusinessId,
        channel_account_id: mockChannelAccountId,
        delivery_status: "queued",
        content: "Hello from AI Sales Manager!",
        external_message_id: null,
        conversation: {
          external_thread_id: "customer_ig_user_999",
        },
        channel_account: {
          id: mockChannelAccountId,
          channel: "instagram",
          status: "active",
          credentials_ref: encryptedToken,
          page_id: "meta_page_12345",
        },
        attachments: [],
      });

      // Mock Meta API response
      jest.spyOn(metaApiClient, "sendMessage").mockResolvedValue({
        ok: true,
        externalMessageId: "mid.meta.instagram.resp.12345",
      });

      const mockJob = {
        id: mockMessageId,
        data: { messageId: mockMessageId, businessId: mockBusinessId },
        opts: { attempts: 3 },
        attemptsMade: 0,
      } as unknown as Job;

      const result = await outboundProcessor.processJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.externalMessageId).toBe("mid.meta.instagram.resp.12345");

      // Verify token decrypted & sent to Meta
      expect(metaApiClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "instagram",
          recipientPlatformUserId: "customer_ig_user_999",
          text: "Hello from AI Sales Manager!",
        }),
        mockPlainToken,
      );

      // Verify DB update
      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: mockMessageId },
        data: {
          delivery_status: "sent",
          external_message_id: "mid.meta.instagram.resp.12345",
        },
      });
    });

    it("Outbound Image Send: Generates short-lived signed GET URL for Meta Graph API", async () => {
      const encryptedToken = metaOAuthService.encryptToken(mockPlainToken);

      mockPrisma.message.findUnique.mockResolvedValue({
        id: mockMessageId,
        business_id: mockBusinessId,
        channel_account_id: mockChannelAccountId,
        delivery_status: "queued",
        content: null,
        external_message_id: null,
        conversation: {
          external_thread_id: "customer_ig_user_999",
        },
        channel_account: {
          id: mockChannelAccountId,
          channel: "instagram",
          status: "active",
          credentials_ref: encryptedToken,
        },
        attachments: [
          {
            id: "att-1",
            s3_key: "businesses/biz-1/images/product.png",
            url: null,
            sort_order: 0,
          },
        ],
      });

      const sendSpy = jest.spyOn(metaApiClient, "sendMessage").mockResolvedValue({
        ok: true,
        externalMessageId: "mid.meta.image.123",
      });

      const mockJob = {
        id: mockMessageId,
        data: { messageId: mockMessageId, businessId: mockBusinessId },
        opts: { attempts: 3 },
        attemptsMade: 0,
      } as unknown as Job;

      const result = await outboundProcessor.processJob(mockJob);

      expect(result.success).toBe(true);
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "instagram",
          imageS3Key: "businesses/biz-1/images/product.png",
          imageUrl: expect.stringContaining(
            "https://s3.signed.url/businesses/biz-1/images/product.png",
          ),
        }),
        mockPlainToken,
      );
    });

    it("Exponential Retries: Transient 500 errors trigger retries with backoff.", async () => {
      const encryptedToken = metaOAuthService.encryptToken(mockPlainToken);

      mockPrisma.message.findUnique.mockResolvedValue({
        id: mockMessageId,
        business_id: mockBusinessId,
        channel_account_id: mockChannelAccountId,
        delivery_status: "queued",
        content: "Transient retry test",
        conversation: { external_thread_id: "customer_123" },
        channel_account: {
          id: mockChannelAccountId,
          channel: "messenger",
          status: "active",
          credentials_ref: encryptedToken,
        },
        attachments: [],
      });

      // Transient 5xx error
      jest.spyOn(metaApiClient, "sendMessage").mockResolvedValue({
        ok: false,
        retryable: true,
        providerCode: "500",
        message: "Meta Graph internal server error",
      });

      const mockJobAttempt1 = {
        id: mockMessageId,
        data: { messageId: mockMessageId, businessId: mockBusinessId },
        opts: { attempts: 3 },
        attemptsMade: 0, // First attempt
      } as unknown as Job;

      // Non-final attempt throws error to trigger BullMQ exponential retry
      await expect(outboundProcessor.processJob(mockJobAttempt1)).rejects.toThrow(
        /Meta outbound dispatch failed/i,
      );

      // Final attempt (attemptsMade = 2 of 3) marks delivery_status = failed in DB
      const mockJobAttempt3 = {
        id: mockMessageId,
        data: { messageId: mockMessageId, businessId: mockBusinessId },
        opts: { attempts: 3 },
        attemptsMade: 2, // Final attempt
      } as unknown as Job;

      await expect(outboundProcessor.processJob(mockJobAttempt3)).rejects.toThrow();

      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: mockMessageId },
        data: { delivery_status: "failed" },
      });
    });

    it("DLQ Handling: Fatal errors mark message FAILED and throw UnrecoverableError for BullMQ DLQ.", async () => {
      const encryptedToken = metaOAuthService.encryptToken(mockPlainToken);

      mockPrisma.message.findUnique.mockResolvedValue({
        id: mockMessageId,
        business_id: mockBusinessId,
        channel_account_id: mockChannelAccountId,
        delivery_status: "queued",
        content: "Fatal error test",
        conversation: { external_thread_id: "invalid_user_999" },
        channel_account: {
          id: mockChannelAccountId,
          channel: "instagram",
          status: "active",
          credentials_ref: encryptedToken,
        },
        attachments: [],
      });

      // Fatal 400/403/190 error (invalid recipient or revoked token)
      jest.spyOn(metaApiClient, "sendMessage").mockResolvedValue({
        ok: false,
        retryable: false,
        providerCode: "190",
        message: "Invalid OAuth access token - token has been revoked",
      });

      const mockJob = {
        id: mockMessageId,
        data: { messageId: mockMessageId, businessId: mockBusinessId },
        opts: { attempts: 3 },
        attemptsMade: 0,
      } as unknown as Job;

      await expect(outboundProcessor.processJob(mockJob)).rejects.toThrow(UnrecoverableError);

      // Verify message updated to failed immediately
      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: mockMessageId },
        data: { delivery_status: "failed" },
      });

      // Verify channel account set to error on auth revocation
      expect(mockPrisma.channelAccount.update).toHaveBeenCalledWith({
        where: { id: mockChannelAccountId },
        data: expect.objectContaining({
          status: "error",
          last_error: expect.stringContaining("Invalid OAuth access token"),
        }),
      });
    });

    it("Invariants: Skips dispatch when message is already delivered or external_message_id is present", async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: mockMessageId,
        delivery_status: "delivered",
        external_message_id: "already_sent_mid_123",
      });

      const sendSpy = jest.spyOn(metaApiClient, "sendMessage");

      const mockJob = {
        id: mockMessageId,
        data: { messageId: mockMessageId, businessId: mockBusinessId },
      } as unknown as Job;

      const result = await outboundProcessor.processJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("Invariants: Marks message failed if channel account is inactive or disconnected", async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: mockMessageId,
        delivery_status: "queued",
        channel_account: {
          id: mockChannelAccountId,
          status: "disconnected",
        },
      });

      const mockJob = {
        id: mockMessageId,
        data: { messageId: mockMessageId, businessId: mockBusinessId },
      } as unknown as Job;

      await expect(outboundProcessor.processJob(mockJob)).rejects.toThrow(UnrecoverableError);

      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: mockMessageId },
        data: { delivery_status: "failed" },
      });
    });

    it("Invariants: Handles corrupted encrypted token gracefully by marking failed and throwing UnrecoverableError", async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: mockMessageId,
        delivery_status: "queued",
        channel_account: {
          id: mockChannelAccountId,
          status: "active",
          credentials_ref: "invalid:corrupted:token",
        },
      });

      const mockJob = {
        id: mockMessageId,
        data: { messageId: mockMessageId, businessId: mockBusinessId },
      } as unknown as Job;

      await expect(outboundProcessor.processJob(mockJob)).rejects.toThrow(UnrecoverableError);

      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: mockMessageId },
        data: { delivery_status: "failed" },
      });
    });

    it("Invariants: Fails safely without dispatching if external_thread_id is missing or conversation is null", async () => {
      const encryptedToken = metaOAuthService.encryptToken(mockPlainToken);

      mockPrisma.message.findUnique.mockResolvedValue({
        id: mockMessageId,
        delivery_status: "queued",
        conversation: null, // tests null conversation relation safely
        channel_account: {
          id: mockChannelAccountId,
          status: "active",
          credentials_ref: encryptedToken,
        },
        attachments: [],
      });

      const sendSpy = jest.spyOn(metaApiClient, "sendMessage");

      const mockJob = {
        id: mockMessageId,
        data: { messageId: mockMessageId, businessId: mockBusinessId },
      } as unknown as Job;

      await expect(outboundProcessor.processJob(mockJob)).rejects.toThrow(UnrecoverableError);

      expect(sendSpy).not.toHaveBeenCalled();
      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: mockMessageId },
        data: { delivery_status: "failed" },
      });
    });
  });

  describe("MetaApiClient HTTP Dispatcher", () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("dispatches Instagram message with Bearer token", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify({ message_id: "mid_ig_12345" })),
      });

      const result = await metaApiClient.sendMessage(
        {
          channel: "instagram",
          recipientPlatformUserId: "ig_user_1",
          text: "Test IG message",
          pageId: "page_123",
        },
        mockPlainToken,
      );

      expect(result.ok).toBe(true);
      expect(result.externalMessageId).toBe("mid_ig_12345");
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("https://graph.facebook.com/"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockPlainToken}`,
          }),
        }),
      );
    });

    it("dispatches WhatsApp message with WhatsApp Cloud API format", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            messages: [{ id: "wamid.HBgLMTIzNDU2Nzg5" }],
          }),
        ),
      });

      const result = await metaApiClient.sendMessage(
        {
          channel: "whatsapp",
          recipientPlatformUserId: "+1234567890",
          text: "Test WhatsApp message",
          pageId: "wa_phone_number_id_999",
        },
        mockPlainToken,
      );

      expect(result.ok).toBe(true);
      expect(result.externalMessageId).toBe("wamid.HBgLMTIzNDU2Nzg5");
    });

    it("does not fabricate fake externalMessageId on HTTP 200 without ID", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: jest.fn().mockResolvedValue(JSON.stringify({ success: true })),
      });

      const result = await metaApiClient.sendMessage(
        {
          channel: "instagram",
          recipientPlatformUserId: "ig_user_1",
          text: "Test IG message",
        },
        mockPlainToken,
      );

      expect(result.ok).toBe(true);
      expect(result.externalMessageId).toBeUndefined();
    });

    it("classifies 429 and 500 responses as retryable", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            error: {
              code: 4,
              message: "Application request limit reached",
              is_transient: true,
            },
          }),
        ),
      });

      const result = await metaApiClient.sendMessage(
        {
          channel: "instagram",
          recipientPlatformUserId: "ig_user_1",
          text: "Rate limited message",
        },
        mockPlainToken,
      );

      expect(result.ok).toBe(false);
      expect(result.retryable).toBe(true);
    });

    it("classifies 400 Bad Request as fatal/non-retryable", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            error: {
              code: 100,
              message: "Unsupported get request. Object with ID does not exist.",
            },
          }),
        ),
      });

      const result = await metaApiClient.sendMessage(
        {
          channel: "messenger",
          recipientPlatformUserId: "unknown_recipient",
          text: "Fatal message",
        },
        mockPlainToken,
      );

      expect(result.ok).toBe(false);
      expect(result.retryable).toBe(false);
    });
  });
});
