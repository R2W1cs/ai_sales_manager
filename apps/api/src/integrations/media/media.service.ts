import * as crypto from "node:crypto";
import * as dns from "node:dns/promises";
import * as net from "node:net";

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { MessageAttachment, PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";

import { env } from "@app/shared/server";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { connection } from "../../lib/queue";
import { deleteFile, uploadFile } from "../../lib/storage";

export const FETCH_INBOUND_MEDIA_QUEUE = "integrations";
export const FETCH_INBOUND_MEDIA_JOB = "fetch_inbound_media";
export const MAX_MEDIA_SIZE_BYTES = 10 * 1024 * 1024; // 10MB (10,485,760 bytes)
export const MAX_MEDIA_REDIRECTS = 3;

export interface FetchInboundMediaJobData {
  messageId: string;
  businessId: string;
  providerUrl: string;
  channelAccountId?: string | null;
  sortOrder?: number;
  contentType?: string;
}

export interface DownloadMediaResult {
  buffer: Buffer;
  contentType: string;
  sizeBytes: number;
}

export interface ProcessInboundMediaParams {
  businessId: string;
  messageId: string;
  providerUrl: string;
  accessToken?: string;
  sortOrder?: number;
  contentType?: string;
}

/**
 * Validates whether an IP address is a private, loopback, link-local, or cloud metadata address.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  // IPv4 Check
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1, 5).map(Number);
    if (octets.some((o) => o < 0 || o > 255)) return true;
    const [o0, o1] = octets;

    // 0.0.0.0/8 (Current network)
    if (o0 === 0) return true;
    // 10.0.0.0/8 (Private network)
    if (o0 === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (o0 === 127) return true;
    // 169.254.0.0/16 (Link-local & Cloud Metadata 169.254.169.254)
    if (o0 === 169 && o1 === 254) return true;
    // 172.16.0.0/12 (Private network: 172.16.0.0 - 172.31.255.255)
    if (o0 === 172 && o1 !== undefined && o1 >= 16 && o1 <= 31) return true;
    // 192.168.0.0/16 (Private network)
    if (o0 === 192 && o1 === 168) return true;
    // 100.64.0.0/10 (Shared address space / Carrier-grade NAT)
    if (o0 === 100 && o1 !== undefined && o1 >= 64 && o1 <= 127) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (o0 === 192 && o1 === 0 && octets[2] === 0) return true;
    // 198.18.0.0/15 (Benchmarking)
    if (o0 === 198 && o1 !== undefined && (o1 === 18 || o1 === 19)) return true;
    // 224.0.0.0/4 (Multicast: 224.0.0.0 - 239.255.255.255)
    if (o0 !== undefined && o0 >= 224 && o0 <= 239) return true;
    // 240.0.0.0/4 (Reserved: 240.0.0.0 - 255.255.255.254)
    if (o0 !== undefined && o0 >= 240) return true;

    return false;
  }

  // IPv6 Check
  const cleanIp = ip.toLowerCase();
  if (cleanIp === "::1" || cleanIp === "::" || cleanIp === "0:0:0:0:0:0:0:1") return true;
  // Link-local fe80::/10
  if (
    cleanIp.startsWith("fe80:") ||
    cleanIp.startsWith("fe8") ||
    cleanIp.startsWith("fe9") ||
    cleanIp.startsWith("fea") ||
    cleanIp.startsWith("feb")
  ) {
    return true;
  }
  // Unique local fc00::/7 (fc00:: - fdff::)
  if (cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) return true;
  // IPv4-mapped IPv6
  if (cleanIp.includes("::ffff:")) {
    const mappedPart = cleanIp.split("::ffff:")[1];
    if (mappedPart && isPrivateOrReservedIp(mappedPart)) return true;
  }

  return false;
}

/**
 * Validates whether a hostname is prohibited (loopback, internal, cloud metadata).
 */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().trim();
  if (!host) return true;

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".arpa") ||
    host === "169.254.169.254" ||
    host === "metadata.google.internal" ||
    host === "metadata.internal" ||
    host === "instance-data"
  ) {
    return true;
  }

  if (isPrivateOrReservedIp(host)) {
    return true;
  }

  return false;
}

@Injectable()
export class MediaService {
  private readonly prisma: PrismaClient;
  private queue: Queue<FetchInboundMediaJobData> | null = null;

  constructor(
    @Optional() prismaClient?: PrismaClient,
    @Optional() queue?: Queue<FetchInboundMediaJobData> | null,
  ) {
    this.prisma = prismaClient ?? prisma;
    if (queue !== undefined) {
      this.queue = queue;
    } else {
      try {
        this.queue = new Queue<FetchInboundMediaJobData>(FETCH_INBOUND_MEDIA_QUEUE, {
          connection,
        });
      } catch (err) {
        logger.warn({ err }, "Could not initialize BullMQ fetch_inbound_media queue");
      }
    }
  }

  /**
   * 17 §10 / 16 §4.4 SSRF Validation Rule.
   * Enforces HTTPS only, prohibits private/loopback/link-local/metadata targets,
   * and fails closed on DNS lookup failure or private resolution.
   */
  async validateMediaUrl(rawUrl: string): Promise<URL> {
    if (!rawUrl || typeof rawUrl !== "string") {
      throw new BadRequestException({
        error: {
          code: "invalid_media_url",
          message: "Media URL is required",
        },
      });
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new BadRequestException({
        error: {
          code: "invalid_media_url",
          message: `Malformed media URL: ${rawUrl}`,
        },
      });
    }

    // 17 §10: HTTPS only
    if (parsed.protocol !== "https:") {
      throw new BadRequestException({
        error: {
          code: "ssrf_violation",
          message: "Only HTTPS URLs are permitted for media downloads",
        },
      });
    }

    // 17 §10: Hostname and IP check
    const hostname = parsed.hostname;
    if (isBlockedHostname(hostname)) {
      throw new BadRequestException({
        error: {
          code: "ssrf_violation",
          message: `Media URL host '${hostname}' is disallowed (private/loopback/metadata target)`,
        },
      });
    }

    // Perform DNS lookup verification — fail closed on lookup error or private address resolution
    if (net.isIP(hostname) === 0 && env.NODE_ENV !== "test") {
      try {
        const lookupResults = await dns.lookup(hostname, { all: true });
        if (lookupResults.length === 0) {
          throw new BadRequestException({
            error: {
              code: "ssrf_violation",
              message: `DNS lookup failed for media URL host '${hostname}'`,
            },
          });
        }
        for (const address of lookupResults) {
          if (isPrivateOrReservedIp(address.address)) {
            throw new BadRequestException({
              error: {
                code: "ssrf_violation",
                message: `Media URL host '${hostname}' resolves to private/reserved IP ${address.address}`,
              },
            });
          }
        }
      } catch (err) {
        if (err instanceof BadRequestException) {
          throw err;
        }
        logger.error({ err, hostname }, "DNS lookup failed for media URL hostname; failing closed");
        throw new BadRequestException({
          error: {
            code: "ssrf_violation",
            message: `DNS resolution failed for media host '${hostname}'`,
          },
        });
      }
    }

    return parsed;
  }

  /**
   * Enqueues a media download job to BullMQ.
   * 16 §4.4 / 14 §7: Job ID is `{messageId}:media`.
   */
  async enqueueFetchInboundMedia(
    data: FetchInboundMediaJobData,
    options?: { priority?: number; delay?: number },
  ) {
    if (!data.messageId || !data.businessId || !data.providerUrl) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "messageId, businessId, and providerUrl are required to enqueue media download",
        },
      });
    }

    if (!this.queue) {
      logger.error(
        { messageId: data.messageId },
        "Media queue is not initialized or connected; cannot enqueue media download",
      );
      throw new ServiceUnavailableException({
        error: {
          code: "queue_unavailable",
          message: "Media download queue is not available",
        },
      });
    }

    // 16 §4.4 / 14 §7: Spec jobId is {messageId}:media
    const jobId = `${data.messageId}:media`;

    try {
      const job = await this.queue.add(FETCH_INBOUND_MEDIA_JOB, data, {
        jobId,
        priority: options?.priority,
        delay: options?.delay,
        attempts: 3, // 16 §4.4 & 14 §4: retry 3
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      });

      logger.info(
        { jobId, messageId: data.messageId, businessId: data.businessId },
        "Inbound media fetch job enqueued",
      );

      return {
        queued: true,
        jobId,
        job,
      };
    } catch (err) {
      logger.error({ jobId, messageId: data.messageId, err }, "Failed to push media job to BullMQ");
      throw err;
    }
  }

  /**
   * Downloads media from Meta CDN / provider URL with size limit validation (<= 10MB)
   * and manual redirect validation to prevent SSRF through redirects (17 §10).
   */
  async downloadMedia(
    providerUrl: string,
    options?: { accessToken?: string; timeoutMs?: number; maxRedirects?: number },
  ): Promise<DownloadMediaResult> {
    const maxRedirects = options?.maxRedirects ?? MAX_MEDIA_REDIRECTS;
    let currentUrl = providerUrl;
    let redirectCount = 0;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 15000);

    try {
      while (redirectCount <= maxRedirects) {
        // 17 §10: Validate each URL (initial and every redirect target) for SSRF
        await this.validateMediaUrl(currentUrl);

        const headers: Record<string, string> = {
          "User-Agent": "AI-Sales-Manager/1.0",
        };

        if (options?.accessToken) {
          headers.Authorization = `Bearer ${options.accessToken}`;
        }

        let response: Response;
        try {
          response = await fetch(currentUrl, {
            method: "GET",
            headers,
            signal: controller.signal,
            redirect: "manual",
          });
        } catch (fetchErr) {
          logger.error({ fetchErr, currentUrl }, "Failed to fetch media from provider URL");
          throw fetchErr;
        }

        // Handle 3xx Redirects manually with SSRF validation
        if (response.status >= 300 && response.status < 400) {
          redirectCount++;
          if (redirectCount > maxRedirects) {
            throw new BadRequestException({
              error: {
                code: "ssrf_violation",
                message: `Exceeded maximum redirect limit (${maxRedirects}) during media download`,
              },
            });
          }

          const location = response.headers.get("location");
          if (!location) {
            throw new BadRequestException({
              error: {
                code: "invalid_media_redirect",
                message: "Redirect response missing Location header",
              },
            });
          }

          // Resolve relative redirect against currentUrl
          currentUrl = new URL(location, currentUrl).toString();
          continue;
        }

        if (!response.ok) {
          logger.warn(
            { status: response.status, statusText: response.statusText, currentUrl },
            "Provider CDN returned non-OK status for media download",
          );
          throw new Error(
            `Failed to download media: HTTP ${response.status} ${response.statusText}`,
          );
        }

        // Validate Content-Length if provided
        const contentLengthHeader = response.headers.get("content-length");
        if (contentLengthHeader) {
          const contentLength = parseInt(contentLengthHeader, 10);
          if (!isNaN(contentLength) && contentLength > MAX_MEDIA_SIZE_BYTES) {
            throw new PayloadTooLargeException({
              error: {
                code: "media_too_large",
                message: `Attachment size ${contentLength} bytes exceeds the maximum limit of ${MAX_MEDIA_SIZE_BYTES} bytes (10MB)`,
              },
            });
          }
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length > MAX_MEDIA_SIZE_BYTES) {
          throw new PayloadTooLargeException({
            error: {
              code: "media_too_large",
              message: `Attachment size ${buffer.length} bytes exceeds the maximum limit of ${MAX_MEDIA_SIZE_BYTES} bytes (10MB)`,
            },
          });
        }

        const rawContentType = response.headers.get("content-type") || "image/jpeg";
        const contentType = rawContentType.split(";")[0]?.trim() || "image/jpeg";

        return {
          buffer,
          contentType,
          sizeBytes: buffer.length,
        };
      }

      throw new BadRequestException({
        error: {
          code: "ssrf_violation",
          message: `Exceeded maximum redirect limit (${maxRedirects}) during media download`,
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * End-to-end processing: verifies message, checks existing attachment idempotently,
   * downloads media from Meta CDN, uploads to MinIO/S3 under {business_id}/attachments/{id},
   * and records message_attachments row (cleaning up orphan S3 object if conflict occurs).
   */
  async processInboundMedia(params: ProcessInboundMediaParams): Promise<MessageAttachment> {
    const { businessId, messageId, providerUrl, accessToken } = params;
    const sortOrder = params.sortOrder ?? 0;

    // 1. Verify message exists and belongs to businessId
    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        business_id: businessId,
      },
    });

    if (!message) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: `Message ${messageId} not found for business ${businessId}`,
        },
      });
    }

    // 2. Check if attachment already exists before download (Idempotency)
    const existing = await this.prisma.messageAttachment.findUnique({
      where: {
        message_id_sort_order: {
          message_id: messageId,
          sort_order: sortOrder,
        },
      },
    });

    if (existing) {
      logger.info(
        { messageId, sortOrder, attachmentId: existing.id },
        "Media attachment already processed and stored",
      );
      return existing;
    }

    // 3. Download media from provider CDN (with SSRF & redirect guardrails)
    const { buffer, contentType } = await this.downloadMedia(providerUrl, {
      accessToken,
    });

    // 4. Store in S3 and database under tenant prefix: {business_id}/attachments/{id}
    const attachmentId = crypto.randomUUID();
    const s3Key = `${businessId}/attachments/${attachmentId}`;
    const effectiveContentType = params.contentType || contentType;

    await uploadFile(s3Key, buffer, {
      contentType: effectiveContentType,
      metadata: {
        businessId,
        messageId,
        attachmentId,
      },
    });

    logger.info(
      { businessId, messageId, attachmentId, s3Key, sizeBytes: buffer.length },
      "Media attachment uploaded to S3",
    );

    try {
      const created = await this.prisma.messageAttachment.create({
        data: {
          id: attachmentId,
          business_id: businessId,
          message_id: messageId,
          s3_key: s3Key,
          content_type: effectiveContentType,
          size_bytes: buffer.length,
          sort_order: sortOrder,
        },
      });

      return created;
    } catch (dbErr: unknown) {
      // On unique constraint conflict, delete newly uploaded S3 object to prevent orphan files
      if (
        typeof dbErr === "object" &&
        dbErr !== null &&
        "code" in dbErr &&
        (dbErr as { code: string }).code === "P2002"
      ) {
        logger.info(
          { messageId, sortOrder, s3Key },
          "Attachment conflict on (message_id, sort_order); removing orphan S3 object and returning existing",
        );
        try {
          await deleteFile(s3Key);
        } catch (delErr) {
          logger.warn({ delErr, s3Key }, "Failed to delete orphan S3 object after conflict");
        }

        const existingAfterRace = await this.prisma.messageAttachment.findUnique({
          where: {
            message_id_sort_order: {
              message_id: messageId,
              sort_order: sortOrder,
            },
          },
        });

        if (existingAfterRace) {
          return existingAfterRace;
        }
      }

      throw dbErr;
    }
  }
}
