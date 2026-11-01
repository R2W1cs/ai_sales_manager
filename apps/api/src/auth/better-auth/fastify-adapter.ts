import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Better Auth ↔ Fastify bridge.
 *
 * Better Auth ships a web-standard `Request -> Response` handler. This adapter
 * is the thin translation layer for Fastify, kept in-repo rather than taking a
 * third-party Nest wrapper: it is small, it is covered by the HTTP integration
 * suite, and it avoids coupling auth to a package that must track both Nest and
 * Better Auth releases.
 *
 * It differs deliberately from the snippet in Better Auth's Fastify guide:
 *
 * - the body is forwarded as the **raw request bytes** rather than
 *   `JSON.stringify(request.body)`. Re-serializing corrupts
 *   `application/x-www-form-urlencoded` payloads and loses byte fidelity.
 * - `Set-Cookie` is copied via `getSetCookie()`, the only spec-guaranteed way
 *   to read multiple cookies off a `Headers` object. Sign-out emits three.
 * - the response is written through the Fastify reply API, so `onSend` hooks
 *   still run. Writing to `reply.raw` would skip the CORS and security-header
 *   plugins.
 */

/** Converts Node/Fastify inbound headers into a web `Headers` object. */
export function toWebHeaders(
  source: Record<string, string | string[] | undefined> | Headers | undefined,
): Headers {
  if (!source) return new Headers();
  if (source instanceof Headers) return source;

  const headers = new Headers();
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
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
 * Fastify request: `AuthService`, `TenantGuard` and the Socket.IO handshake.
 * Matches the signature of Better Auth's own `fromNodeHeaders`.
 */
export const fromNodeHeaders = toWebHeaders;

/** Absolute URL of the inbound request, honouring proxy forwarding headers. */
export function resolveRequestUrl(request: FastifyRequest): URL {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const proto =
    (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto)?.split(",")[0]?.trim() ||
    request.protocol;

  const forwardedHost = request.headers["x-forwarded-host"];
  const host =
    (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost)?.split(",")[0]?.trim() ||
    request.headers.host ||
    "localhost";

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
    headers: toWebHeaders(request.headers),
    body,
  });
}

/** Copies a web `Response` onto a Fastify reply and sends it. */
export async function sendWebResponse(reply: FastifyReply, response: Response): Promise<void> {
  reply.status(response.status);

  for (const cookie of response.headers.getSetCookie()) {
    // `reply.header` appends for set-cookie, preserving every cookie.
    reply.header("set-cookie", cookie);
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
    const response = await handler(toWebRequest(request));
    await sendWebResponse(reply, response);
  };
}
