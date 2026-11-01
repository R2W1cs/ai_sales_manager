import * as crypto from "node:crypto";

import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  PayloadTooLargeException,
  UnauthorizedException,
} from "@nestjs/common";

import { env } from "@app/shared/server";

import type { HttpRequest } from "../../platform/core/http";

export const MAX_PAYLOAD_BYTES = 512 * 1024; // 512 KB (16 §4.2)

/** Request carrying the preserved raw body bytes. */
export type RawBodyRequest = Pick<HttpRequest, "headers"> & {
  rawBody?: Buffer | string;
  body?: unknown;
};

/**
 * Extracts the raw request body.
 *
 * Per 16 §4.2 the HMAC must be computed over the exact bytes Meta signed, never
 * `JSON.stringify(parsed)`. `request.rawBody` is populated because the app is
 * created with `rawBody: true` (see `src/bootstrap.ts`); without it this guard
 * sees an empty buffer and fails closed on every request.
 */
export function getRawBodyBuffer(req: RawBodyRequest): Buffer {
  const requestWithRaw = req;
  if (requestWithRaw.rawBody) {
    return Buffer.isBuffer(requestWithRaw.rawBody)
      ? requestWithRaw.rawBody
      : Buffer.from(requestWithRaw.rawBody, "utf8");
  }
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === "string") {
    return Buffer.from(req.body, "utf8");
  }
  return Buffer.alloc(0);
}

/**
 * Validates Meta SHA-256 HMAC signature using timing-safe comparison.
 */
export function verifyMetaHmac(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret || rawBody.length === 0) {
    return false;
  }

  // Format must be sha256=<hex>
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) {
    return false;
  }

  const signatureHex = signatureHeader.slice(prefix.length).trim();
  if (!signatureHex) {
    return false;
  }

  const calculatedHex = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");

  const sigBuf = Buffer.from(signatureHex, "hex");
  const calcBuf = Buffer.from(calculatedHex, "hex");

  if (sigBuf.length === 0 || calcBuf.length === 0 || sigBuf.length !== calcBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuf, calcBuf);
}

@Injectable()
export class MetaHmacGuard implements CanActivate {
  private throwPayloadTooLarge(): never {
    throw new PayloadTooLargeException({
      error: {
        code: "payload_too_large",
        message: "Webhook payload exceeds 512 KB limit",
      },
    });
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<RawBodyRequest>();

    // 1. Content-Length check (16 §4.2: >512 KB -> 413 before HMAC)
    const contentLengthHeader = req.headers["content-length"];
    if (typeof contentLengthHeader === "string") {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (!Number.isNaN(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
        this.throwPayloadTooLarge();
      }
    }

    const rawBody = getRawBodyBuffer(req);

    // Buffered body size check
    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      this.throwPayloadTooLarge();
    }

    // 2. Signature verification
    const signatureHeader =
      (req.headers["x-hub-signature-256"] as string | undefined) ||
      (req.headers["X-Hub-Signature-256"] as string | undefined);

    const appSecret = env.META_APP_SECRET ?? "";

    const isValid = verifyMetaHmac(rawBody, signatureHeader, appSecret);

    if (!isValid) {
      throw new UnauthorizedException({
        error: {
          code: "webhook_invalid_signature",
          message: "Invalid or missing X-Hub-Signature-256 header",
        },
      });
    }

    return true;
  }
}
