import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Shared HTTP primitives for the Fastify adapter.
 *
 * Fastify's request object is not API-compatible with Express in three places
 * this codebase relied on, so the replacements live here rather than being
 * re-derived in every guard and controller:
 *
 * - there is no `request.path` (only `request.url`, which includes the query)
 * - there is no `request.secure`
 * - `request.cookies` requires `@fastify/cookie` to be registered
 */
export type HttpRequest = FastifyRequest;
export type HttpReply = FastifyReply;

/**
 * Request path with the query string removed.
 *
 * Express exposed this as `request.path`. Fastify does not, and reading
 * `request.url` directly would fold the query string into route checks.
 */
export function requestPath(request: Pick<FastifyRequest, "url">): string {
  const url = typeof request.url === "string" ? request.url : "";
  const queryStart = url.indexOf("?");
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

/**
 * Whether the original client request arrived over TLS.
 *
 * Express had `request.secure`. Fastify derives `request.protocol` from
 * `X-Forwarded-Proto` when `trustProxy` is enabled, which is how the API runs
 * behind the load balancer (18 §1).
 */
export function isSecureRequest(request: {
  protocol?: string;
  headers?: Record<string, string | string[] | undefined>;
}): boolean {
  if (request.protocol === "https") {
    return true;
  }
  const forwarded = request.headers?.["x-forwarded-proto"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return typeof value === "string" && value.split(",")[0]?.trim() === "https";
}

/**
 * Best-effort client IP for rate limiting.
 *
 * `request.ip` already resolves `X-Forwarded-For` when `trustProxy` is enabled,
 * so it is preferred over reading the header directly.
 */
export function clientIp(request: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string {
  if (typeof request.ip === "string" && request.ip.length > 0) {
    return request.ip;
  }
  const forwarded = request.headers?.["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = typeof value === "string" ? value.split(",")[0]?.trim() : undefined;
  return first || request.socket?.remoteAddress || "127.0.0.1";
}
