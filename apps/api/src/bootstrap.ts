import { randomUUID } from "node:crypto";

import fastifyCompress from "@fastify/compress";
import fastifyCookie from "@fastify/cookie";
import fastifyHelmet from "@fastify/helmet";
import type { NestApplicationOptions } from "@nestjs/common";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";

import { env } from "@app/shared/server";

import { logger } from "./lib/logger";

/**
 * Shared HTTP application configuration.
 *
 * `main.ts` and the HTTP integration harness both build the app through this
 * module so the runtime under test is the runtime that ships. The concrete
 * adapter is selected in exactly one place (`createHttpAdapter`).
 */

/**
 * Request body cap (13 §2.1).
 *
 * The Meta webhook is the largest JSON surface at 512 KB, and Fastify applies
 * `bodyLimit` per instance, so the global cap is 512 KB. Tighter per-surface
 * caps (256 KB JSON, 10 KB message content) stay in the Zod contracts and in
 * `MetaHmacGuard`, which rejects >512 KB with 413 before HMAC.
 */
export const BODY_LIMIT_BYTES = 512 * 1024;

/** Methods reachable cross-origin. Mirrors the verbs the controllers expose. */
export const CORS_METHODS = ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"];

/** Request headers the browser client is allowed to send (13 §2.4). */
export const CORS_ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Business-Id",
  "Idempotency-Key",
  "X-Request-Id",
];

/** Response headers the browser client is allowed to read. */
export const CORS_EXPOSED_HEADERS = ["X-Request-Id", "Retry-After"];

/**
 * Explicit CORS origin allowlist (13 §2.1, 17 §10).
 *
 * Never a wildcard: these are credentialed requests, and `*` with
 * `credentials: true` is rejected by browsers and would be unsafe regardless.
 * Localhost origins are added outside production only.
 */
export function corsOrigins(): string[] {
  const origins = new Set<string>();
  for (const candidate of [env.CORS_ORIGIN, env.PUBLIC_APP_URL]) {
    if (typeof candidate === "string" && candidate.length > 0) {
      origins.add(candidate.replace(/\/$/, ""));
    }
  }
  if (env.NODE_ENV !== "production") {
    origins.add("http://localhost:3000");
    origins.add("http://localhost:3001");
    origins.add("http://127.0.0.1:3000");
  }
  return [...origins];
}

export function corsOptions() {
  return {
    origin: corsOrigins(),
    methods: CORS_METHODS,
    allowedHeaders: CORS_ALLOWED_HEADERS,
    exposedHeaders: CORS_EXPOSED_HEADERS,
    credentials: true,
    maxAge: 86400,
  };
}

/**
 * Nest application options shared by the server and the integration harness.
 *
 * `rawBody: true` makes the adapter retain the exact request bytes on
 * `request.rawBody`, which `MetaHmacGuard` requires: Meta's signature is
 * computed over raw bytes and cannot be recovered from a re-serialized object.
 */
export function nestAppOptions(): NestApplicationOptions {
  return { rawBody: true };
}

/**
 * Whether to trust `X-Forwarded-*` headers.
 *
 * Behind the load balancer this must be on, or `request.ip` and
 * `request.protocol` describe the balancer instead of the client (18 §1) and
 * `Secure` cookie inference breaks. With no proxy in front it must be off: the
 * headers are then attacker-controlled, and `AuthThrottlerGuard` keys its rate
 * limit on `request.ip`, so a caller could rotate a forged value to bypass the
 * auth limit (NFR-SEC-09).
 *
 * Defaults to on in production only. `TRUST_PROXY` overrides either way.
 */
export function shouldTrustProxy(): boolean {
  if (env.TRUST_PROXY !== undefined) {
    return env.TRUST_PROXY === "true";
  }
  return env.NODE_ENV === "production";
}

/**
 * The HTTP adapter for every entrypoint.
 *
 * Fastify logs through the same pino instance as the rest of the app, which
 * gives structured request logs with a request id. `X-Request-Id` is honoured
 * when present and generated otherwise (13 §2.1).
 */
export function createHttpAdapter(): FastifyAdapter {
  return new FastifyAdapter({
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: shouldTrustProxy(),
    loggerInstance: logger,
    requestIdHeader: "x-request-id",
    requestIdLogLabel: "request_id",
    genReqId: () => randomUUID(),
  });
}

/**
 * Register Fastify plugins and cross-cutting configuration.
 *
 * Must run before `listen` so plugins are in place when routes are wired.
 */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  // Default security headers. No CSP: this is a JSON API, and 17 §10 forbids
  // inventing one here.
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  // Responses above the plugin's default threshold only; avoids compressing
  // tiny JSON payloads for no benefit.
  await app.register(fastifyCompress, { encodings: ["br", "gzip", "deflate"] });

  // Provides `request.cookies`, `reply.setCookie` and `reply.clearCookie`.
  // No `secret`: nothing here relies on Fastify-signed cookies. Better Auth
  // signs its own session cookies and the refresh token is opaque and random.
  await app.register(fastifyCookie);

  app.enableCors(corsOptions());
  app.enableShutdownHooks();

  // Echo the resolved request id so clients and logs can be correlated.
  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onRequest", (request, reply, done) => {
      void reply.header("x-request-id", request.id);
      done();
    });
}
