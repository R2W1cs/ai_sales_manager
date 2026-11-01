import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
/* oxlint-disable typescript/unbound-method */
import type { PrismaClient } from "@prisma/client";
import { type Queue, type Job, UnrecoverableError } from "bullmq";

import { uploadFile, deleteFile } from "../../lib/storage";
import { MetaOAuthService } from "../meta/meta-oauth.service";
import { MediaProcessor } from "./media.processor";
import {
  MediaService,
  FETCH_INBOUND_MEDIA_JOB,
  MAX_MEDIA_SIZE_BYTES,
  isPrivateOrReservedIp,
  isBlockedHostname,
} from "./media.service";

jest.mock("../../lib/storage", () => ({
  uploadFile: jest.fn().mockImplementation((key: string) =>
    Promise.resolve({
      key,
      etag: '"mock-etag-12345"',
    }),
  ),
  deleteFile: jest.fn().mockImplementation((_key: string) => Promise.resolve()),
  getDownloadUrl: jest
    .fn()
    .mockImplementation((key: string) =>
      Promise.resolve(`https://minio.local:9000/bucket/${key}?signature=valid`),
    ),
  getPublicUrl: jest
    .fn()
    .mockImplementation((key: string) => `https://minio.local:9000/bucket/${key}`),
}));

describe("Media attachments processing & MinIO storage (T-INT-05)", () => {
  let mediaService: MediaService;
  let mediaProcessor: MediaProcessor;
  let metaOAuthService: MetaOAuthService;
  let mockPrisma: any;
  let mockQueue: jest.Mocked<Queue>;

  const mockBusinessId = "biz-1111-2222-3333";
  const mockOtherBusinessId = "biz-9999-8888-7777";
  const mockMessageId = "msg-4444-5555-6666";
  const mockChannelAccountId = "ca-7777-8888-9999";
  const mockAttachmentId = "att-1234-5678-9012";
  const mockValidCdnUrl = "https://lookaside.fbsbx.com/ig_messaging_cdn/v/test_image.jpg";
  const mockImageBuffer = Buffer.from("fake-binary-image-data-jpeg");

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock global.fetch with manual redirect support
    global.fetch = jest.fn().mockImplementation(() => {
      const slice = mockImageBuffer.buffer.slice(
        mockImageBuffer.byteOffset,
        mockImageBuffer.byteOffset + mockImageBuffer.byteLength,
      );
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: {
          get: (header: string) => {
            if (header.toLowerCase() === "content-type") return "image/jpeg";
            if (header.toLowerCase() === "content-length") return String(mockImageBuffer.length);
            return null;
          },
        },
        arrayBuffer: () => Promise.resolve(slice),
      } as unknown as Response);
    });

    metaOAuthService = new MetaOAuthService();

    mockPrisma = {
      message: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      channelAccount: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      messageAttachment: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: `${mockMessageId}:media` } as any),
      getJob: jest.fn().mockResolvedValue(null),
      close: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<Queue>;

    mediaService = new MediaService(mockPrisma as PrismaClient, mockQueue);
    mediaProcessor = new MediaProcessor(
      mediaService,
      metaOAuthService,
      mockPrisma as PrismaClient,
      mockQueue,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("Media Download: Customer photo is downloaded to MinIO and linked to message.", async () => {
    // Setup message exist check
    mockPrisma.message.findFirst.mockResolvedValue({
      id: mockMessageId,
      business_id: mockBusinessId,
      channel_account_id: mockChannelAccountId,
      content_type: "image",
    });

    mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);
    mockPrisma.messageAttachment.create.mockResolvedValue({
      id: mockAttachmentId,
      business_id: mockBusinessId,
      message_id: mockMessageId,
      s3_key: `${mockBusinessId}/attachments/${mockAttachmentId}`,
      content_type: "image/jpeg",
      size_bytes: mockImageBuffer.length,
      sort_order: 0,
      created_at: new Date(),
    });

    const result = await mediaService.processInboundMedia({
      businessId: mockBusinessId,
      messageId: mockMessageId,
      providerUrl: mockValidCdnUrl,
      sortOrder: 0,
    });

    expect(result).toBeDefined();
    expect(result.business_id).toBe(mockBusinessId);
    expect(result.message_id).toBe(mockMessageId);
    expect(result.s3_key).toBe(`${mockBusinessId}/attachments/${mockAttachmentId}`);
    expect(result.content_type).toBe("image/jpeg");

    // S3 upload verification under tenant-prefixed path
    expect(uploadFile).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${mockBusinessId}/attachments/`)),
      mockImageBuffer,
      expect.objectContaining({
        contentType: "image/jpeg",
        metadata: expect.objectContaining({
          businessId: mockBusinessId,
          messageId: mockMessageId,
        }),
      }),
    );

    // Database persistence verification
    expect(mockPrisma.messageAttachment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        business_id: mockBusinessId,
        message_id: mockMessageId,
        content_type: "image/jpeg",
        sort_order: 0,
      }),
    });
  });

  describe("SSRF Protection & Redirect Guardrails (17 §10)", () => {
    it("allows valid public HTTPS URLs", async () => {
      const parsed = await mediaService.validateMediaUrl(mockValidCdnUrl);
      expect(parsed.protocol).toBe("https:");
      expect(parsed.hostname).toBe("lookaside.fbsbx.com");
    });

    it("rejects non-HTTPS protocols (http, ftp, file)", async () => {
      await expect(
        mediaService.validateMediaUrl("http://cdn.example.com/photo.jpg"),
      ).rejects.toThrow(BadRequestException);

      await expect(
        mediaService.validateMediaUrl("ftp://cdn.example.com/photo.jpg"),
      ).rejects.toThrow(BadRequestException);

      await expect(mediaService.validateMediaUrl("file:///etc/passwd")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects loopback and localhost addresses", async () => {
      await expect(mediaService.validateMediaUrl("https://localhost/photo.jpg")).rejects.toThrow(
        BadRequestException,
      );

      await expect(mediaService.validateMediaUrl("https://127.0.0.1/photo.jpg")).rejects.toThrow(
        BadRequestException,
      );

      await expect(
        mediaService.validateMediaUrl("https://sub.localhost/photo.jpg"),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects private IPv4 networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)", async () => {
      await expect(mediaService.validateMediaUrl("https://10.0.0.5/photo.jpg")).rejects.toThrow(
        BadRequestException,
      );

      await expect(mediaService.validateMediaUrl("https://172.20.0.1/photo.jpg")).rejects.toThrow(
        BadRequestException,
      );

      await expect(
        mediaService.validateMediaUrl("https://192.168.1.100/photo.jpg"),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects AWS/Cloud metadata service IP (169.254.169.254) and link-local addresses", async () => {
      await expect(
        mediaService.validateMediaUrl("https://169.254.169.254/latest/meta-data/"),
      ).rejects.toThrow(BadRequestException);

      await expect(mediaService.validateMediaUrl("https://169.254.0.1/test.jpg")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("rejects IPv6 loopback and link-local addresses", () => {
      expect(isPrivateOrReservedIp("::1")).toBe(true);
      expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
      expect(isPrivateOrReservedIp("fc00::1")).toBe(true);
      expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    });

    it("rejects malformed or empty URLs", async () => {
      await expect(mediaService.validateMediaUrl("")).rejects.toThrow(BadRequestException);
      await expect(mediaService.validateMediaUrl("not-a-valid-url")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("follows valid HTTPS redirects up to limit", async () => {
      const redirectTarget = "https://cdn2.fbsbx.com/final_image.jpg";
      const slice = mockImageBuffer.buffer.slice(
        mockImageBuffer.byteOffset,
        mockImageBuffer.byteOffset + mockImageBuffer.byteLength,
      );

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 302,
          statusText: "Found",
          headers: {
            get: (h: string) => (h.toLowerCase() === "location" ? redirectTarget : null),
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: {
            get: (h: string) => {
              if (h.toLowerCase() === "content-type") return "image/jpeg";
              if (h.toLowerCase() === "content-length") return String(mockImageBuffer.length);
              return null;
            },
          },
          arrayBuffer: () => Promise.resolve(slice),
        });

      const result = await mediaService.downloadMedia(mockValidCdnUrl);
      expect(result.buffer).toEqual(mockImageBuffer);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it("blocks redirects targeting private or loopback addresses (fail closed)", async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 302,
        statusText: "Found",
        headers: {
          get: (h: string) =>
            h.toLowerCase() === "location" ? "https://127.0.0.1/evil.jpg" : null,
        },
      });

      await expect(mediaService.downloadMedia(mockValidCdnUrl)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("blocks redirects targeting non-HTTPS protocols", async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        status: 302,
        statusText: "Found",
        headers: {
          get: (h: string) =>
            h.toLowerCase() === "location" ? "http://cdn.example.com/image.jpg" : null,
        },
      });

      await expect(mediaService.downloadMedia(mockValidCdnUrl)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("fails when redirect limit is exceeded", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 302,
        statusText: "Found",
        headers: {
          get: (h: string) =>
            h.toLowerCase() === "location" ? "https://lookaside.fbsbx.com/loop" : null,
        },
      });

      await expect(
        mediaService.downloadMedia(mockValidCdnUrl, { maxRedirects: 2 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("Media Size Limit & Download Guardrails (<= 10MB)", () => {
    it("downloads and returns buffer when size <= 10MB", async () => {
      const result = await mediaService.downloadMedia(mockValidCdnUrl, {
        accessToken: "EAABmockToken",
      });

      expect(result.buffer).toEqual(mockImageBuffer);
      expect(result.contentType).toBe("image/jpeg");
      expect(result.sizeBytes).toBe(mockImageBuffer.length);
      expect(global.fetch).toHaveBeenCalledWith(
        mockValidCdnUrl,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer EAABmockToken",
          }),
        }),
      );
    });

    it("rejects media if Content-Length header exceeds 10MB", async () => {
      global.fetch = jest.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: {
            get: (h: string) => {
              if (h.toLowerCase() === "content-length") return String(MAX_MEDIA_SIZE_BYTES + 1024);
              return "image/png";
            },
          },
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        } as unknown as Response),
      );

      await expect(mediaService.downloadMedia(mockValidCdnUrl)).rejects.toThrow(
        PayloadTooLargeException,
      );
    });

    it("rejects media if downloaded buffer exceeds 10MB", async () => {
      const oversizedBuffer = Buffer.alloc(MAX_MEDIA_SIZE_BYTES + 100);
      global.fetch = jest.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          headers: {
            get: () => null,
          },
          arrayBuffer: () => Promise.resolve(oversizedBuffer.buffer),
        } as unknown as Response),
      );

      await expect(mediaService.downloadMedia(mockValidCdnUrl)).rejects.toThrow(
        PayloadTooLargeException,
      );
    });

    it("throws error when provider CDN returns HTTP error", async () => {
      global.fetch = jest.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
          headers: { get: () => null },
        } as unknown as Response),
      );

      await expect(mediaService.downloadMedia(mockValidCdnUrl)).rejects.toThrow(
        /Failed to download media: HTTP 404/,
      );
    });
  });

  describe("Tenant Isolation & Conflict Resolution", () => {
    it("handles unique constraint conflict (P2002) and cleans up orphan S3 object", async () => {
      mockPrisma.message.findFirst.mockResolvedValue({
        id: mockMessageId,
        business_id: mockBusinessId,
      });

      mockPrisma.messageAttachment.findUnique
        .mockResolvedValueOnce(null) // First check before download: not found
        .mockResolvedValueOnce({
          // Check after race: found existing
          id: "existing-att-id",
          business_id: mockBusinessId,
          message_id: mockMessageId,
          s3_key: `${mockBusinessId}/attachments/existing-att-id`,
          content_type: "image/jpeg",
          size_bytes: 100,
          sort_order: 0,
        });

      const p2002Err = new Error("Unique constraint failed") as any;
      p2002Err.code = "P2002";
      mockPrisma.messageAttachment.create.mockRejectedValue(p2002Err);

      const res = await mediaService.processInboundMedia({
        businessId: mockBusinessId,
        messageId: mockMessageId,
        providerUrl: mockValidCdnUrl,
        sortOrder: 0,
      });

      expect(res.id).toBe("existing-att-id");
      expect(deleteFile).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^${mockBusinessId}/attachments/`)),
      );
    });

    it("returns existing attachment early in processInboundMedia if already present", async () => {
      mockPrisma.message.findFirst.mockResolvedValue({
        id: mockMessageId,
        business_id: mockBusinessId,
      });

      const existingAttachment = {
        id: "existing-att-id",
        business_id: mockBusinessId,
        message_id: mockMessageId,
        s3_key: `${mockBusinessId}/attachments/existing-att-id`,
        content_type: "image/jpeg",
        size_bytes: 500,
        sort_order: 0,
      };
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(existingAttachment);

      const res = await mediaService.processInboundMedia({
        businessId: mockBusinessId,
        messageId: mockMessageId,
        providerUrl: mockValidCdnUrl,
      });

      expect(res).toEqual(existingAttachment);
      expect(uploadFile).not.toHaveBeenCalled();
    });

    it("throws NotFoundException if message does not belong to tenant", async () => {
      mockPrisma.message.findFirst.mockResolvedValue(null);

      await expect(
        mediaService.processInboundMedia({
          businessId: mockOtherBusinessId,
          messageId: mockMessageId,
          providerUrl: mockValidCdnUrl,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("BullMQ Queue & MediaProcessor Worker", () => {
    it("enqueues fetch_inbound_media job with exact {messageId}:media jobId", async () => {
      const enqueueRes = await mediaService.enqueueFetchInboundMedia({
        messageId: mockMessageId,
        businessId: mockBusinessId,
        providerUrl: mockValidCdnUrl,
        sortOrder: 0,
      });

      expect(enqueueRes.queued).toBe(true);
      expect(enqueueRes.jobId).toBe(`${mockMessageId}:media`);
      expect(mockQueue.add).toHaveBeenCalledWith(
        FETCH_INBOUND_MEDIA_JOB,
        expect.objectContaining({
          messageId: mockMessageId,
          businessId: mockBusinessId,
          providerUrl: mockValidCdnUrl,
        }),
        expect.objectContaining({
          jobId: `${mockMessageId}:media`,
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
        }),
      );
    });

    it("throws ServiceUnavailableException when media queue is uninitialized", async () => {
      const uninitService = new MediaService(mockPrisma as PrismaClient, null);
      await expect(
        uninitService.enqueueFetchInboundMedia({
          messageId: mockMessageId,
          businessId: mockBusinessId,
          providerUrl: mockValidCdnUrl,
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it("MediaProcessor ignores non-media jobs on shared integrations queue", async () => {
      const mockJob = {
        id: "job-123",
        name: "deliver_outbound",
        data: {
          messageId: mockMessageId,
        },
      } as unknown as Job;

      const result = await mediaProcessor.processJob(mockJob);
      expect(result.skipped).toBe(true);
      expect(mockPrisma.message.findFirst).not.toHaveBeenCalled();
    });

    it("MediaProcessor processes job and decrypts channel access token", async () => {
      const plainToken = "EAABmockChannelAccessToken999";
      const encryptedToken = metaOAuthService.encryptToken(plainToken);

      mockPrisma.message.findFirst.mockResolvedValue({
        id: mockMessageId,
        business_id: mockBusinessId,
        channel_account: {
          id: mockChannelAccountId,
          credentials_ref: encryptedToken,
        },
      });

      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);
      mockPrisma.messageAttachment.create.mockResolvedValue({
        id: mockAttachmentId,
        business_id: mockBusinessId,
        message_id: mockMessageId,
        s3_key: `${mockBusinessId}/attachments/${mockAttachmentId}`,
        content_type: "image/jpeg",
        size_bytes: mockImageBuffer.length,
        sort_order: 0,
      });

      const mockJob = {
        id: `${mockMessageId}:media`,
        name: FETCH_INBOUND_MEDIA_JOB,
        data: {
          messageId: mockMessageId,
          businessId: mockBusinessId,
          providerUrl: mockValidCdnUrl,
          sortOrder: 0,
        },
        attemptsMade: 0,
      } as unknown as Job;

      const result = await mediaProcessor.processJob(mockJob);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe(mockMessageId);
      expect(result.attachmentId).toBe(mockAttachmentId);
      expect(result.s3Key).toBe(`${mockBusinessId}/attachments/${mockAttachmentId}`);
    });

    it("MediaProcessor throws UnrecoverableError when token decryption fails", async () => {
      mockPrisma.message.findFirst.mockResolvedValue({
        id: mockMessageId,
        business_id: mockBusinessId,
        channel_account: {
          id: mockChannelAccountId,
          credentials_ref: "invalid:encrypted:token",
        },
      });

      const mockJob = {
        id: `${mockMessageId}:media`,
        name: FETCH_INBOUND_MEDIA_JOB,
        data: {
          messageId: mockMessageId,
          businessId: mockBusinessId,
          providerUrl: mockValidCdnUrl,
        },
        attemptsMade: 0,
      } as unknown as Job;

      await expect(mediaProcessor.processJob(mockJob)).rejects.toThrow(UnrecoverableError);
    });

    it("MediaProcessor throws UnrecoverableError on missing message in DB", async () => {
      mockPrisma.message.findFirst.mockResolvedValue(null);

      const mockJob = {
        id: `${mockMessageId}:media`,
        name: FETCH_INBOUND_MEDIA_JOB,
        data: {
          messageId: mockMessageId,
          businessId: mockBusinessId,
          providerUrl: mockValidCdnUrl,
        },
        attemptsMade: 0,
      } as unknown as Job;

      await expect(mediaProcessor.processJob(mockJob)).rejects.toThrow(UnrecoverableError);
    });

    it("MediaProcessor throws UnrecoverableError on SSRF violation", async () => {
      mockPrisma.message.findFirst.mockResolvedValue({
        id: mockMessageId,
        business_id: mockBusinessId,
      });

      const mockJob = {
        id: `${mockMessageId}:media`,
        name: FETCH_INBOUND_MEDIA_JOB,
        data: {
          messageId: mockMessageId,
          businessId: mockBusinessId,
          providerUrl: "http://169.254.169.254/latest/meta-data/",
        },
        attemptsMade: 0,
      } as unknown as Job;

      await expect(mediaProcessor.processJob(mockJob)).rejects.toThrow(UnrecoverableError);
    });

    it("MediaProcessor handles lifecycle init and destroy without error", async () => {
      expect(() => mediaProcessor.onModuleInit()).not.toThrow();
      await expect(mediaProcessor.onModuleDestroy()).resolves.not.toThrow();
    });
  });
});
