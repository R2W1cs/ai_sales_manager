import type { FastifyReply, FastifyRequest } from "fastify";

import { shouldTrustProxy } from "../../bootstrap";

const TRUST_DEVICE_COOKIE_PATTERN = /^(?:__Secure-)?better-auth\.trust_device=/i;
const TRUST_DEVICE_ANYWHERE_PATTERN = /(?:^|;\s*)(?:__Secure-)?better-auth\.trust_device=/i;

/**
 * Strips any `trust_device` cookies from an inbound `Cookie` header before
 * Better Auth evaluates a sign-in request so trusted-device bypass is impossible
 * even if a pre-existing valid cookie is presented.
 */
export function stripTrustDeviceCookies(cookieHeader: string): string {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !TRUST_DEVICE_COOKIE_PATTERN.test(part))
    .join("; ");
}

/** Checks whether an inbound Cookie header carries a `trust_device` cookie. */
export function hasTrustDeviceCookie(cookieHeader: string | string[] | undefined): boolean {
  if (!cookieHeader) return false;
  const joined = Array.isArray(cookieHeader) ? cookieHeader.join("; ") : cookieHeader;
  return TRUST_DEVICE_ANYWHERE_PATTERN.test(joined);
}

/** Converts Node/Fastify inbound headers into a web `Headers` object. */
export function toWebHeaders(
  source: Record<string, string | string[] | undefined> | Headers | undefined,
  options?: { stripTrustDevice?: boolean },
): Headers {
  if (!source) return new Headers();
  if (source instanceof Headers) return source;

  const headers = new Headers();
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const lowerKey = key.toLowerCase();
    if (options?.stripTrustDevice && lowerKey === "cookie") {
      const joined = Array.isArray(value) ? value.join("; ") : value;
      const sanitized = stripTrustDeviceCookies(joined);
      if (sanitized.length > 0) {
        headers.set("cookie", sanitized);
      }
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else {
      headers.set(key, value);
    }
  }
  return headers;
}

/**
 * Alias used by call sites that hold plain Node header records rather than a
 * Fastify request: `TenantGuard`, `PlatformAdminGuard`, and the Socket.IO handshake.
 * Matches the signature of Better Auth's own `fromNodeHeaders`.
 */
export const fromNodeHeaders = (
  source: Record<string, string | string[] | undefined> | Headers | undefined,
): Headers => toWebHeaders(source);

/**
 * Absolute URL of the inbound request.
 * Only honors `X-Forwarded-Proto` / `X-Forwarded-Host` when `shouldTrustProxy()` is enabled
 * (controlled ingress that strips and overwrites client-supplied forwarding headers).
 */
export function resolveRequestUrl(request: FastifyRequest, trustProxy = shouldTrustProxy()): URL {
  let proto = request.protocol || "http";
  let host = request.headers.host || "localhost";

  if (trustProxy) {
    const forwardedProto = request.headers["x-forwarded-proto"];
    const resolvedProto = (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)
      ?.split(",")[0]
      ?.trim();
    if (resolvedProto === "http" || resolvedProto === "https") {
      proto = resolvedProto;
    }

    const forwardedHost = request.headers["x-forwarded-host"];
    const resolvedHost = (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)
      ?.split(",")[0]
      ?.trim();
    if (resolvedHost) {
      host = resolvedHost;
    }
  }

  return new URL(request.url, `${proto}://${host}`);
}

/** Builds the web `Request` Better Auth expects from a Fastify request. */
export function toWebRequest(request: FastifyRequest): Request {
  const method = (request.method || "GET").toUpperCase();
  const carriesBody = method !== "GET" && method !== "HEAD";

  // `rawBody` is populated by the adapter (`rawBody: true`) and preserves the
  // exact bytes, which matters for signature-bearing and form-encoded payloads.
  const raw = (request as FastifyRequest & { rawBody?: Buffer }).rawBody;
  const body = carriesBody && raw && raw.length > 0 ? new Uint8Array(raw) : undefined;

  return new Request(resolveRequestUrl(request).toString(), {
    method,
    headers: toWebHeaders(request.headers, { stripTrustDevice: true }),
    body,
  });
}

/** Copies a web `Response` onto a Fastify reply and expires any trust_device cookies. */
export async function sendWebResponse(
  reply: FastifyReply,
  response: Response,
  options?: { expireTrustDeviceCookie?: boolean },
): Promise<void> {
  reply.status(response.status);

  let sawTrustCookie = Boolean(options?.expireTrustDeviceCookie);
  for (const cookie of response.headers.getSetCookie()) {
    // Strip any non-expiring trust_device Set-Cookie if emitted; pilot disables device trust.
    if (TRUST_DEVICE_COOKIE_PATTERN.test(cookie.trim())) {
      sawTrustCookie = true;
      continue;
    }
    reply.header("set-cookie", cookie);
  }

  if (sawTrustCookie) {
    reply.header(
      "set-cookie",
      "better-auth.trust_device=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
    );
    reply.header(
      "set-cookie",
      "__Secure-better-auth.trust_device=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    );
  }

  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    reply.header(key, value);
  });

  const payload = response.body ? await response.text() : null;
  await reply.send(payload);
}

/**
 * Wraps Better Auth's handler as a Fastify route handler.
 */
export function toFastifyHandler(handler: (request: Request) => Promise<Response>) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const expireTrustDeviceCookie = hasTrustDeviceCookie(request.headers.cookie);
    const response = await handler(toWebRequest(request));
    await sendWebResponse(reply, response, { expireTrustDeviceCookie });
  };
}
