import type { CookieSerializeOptions } from "@fastify/cookie";

import { env } from "@app/shared/server";

import { isSecureRequest, type HttpRequest } from "../../platform/core/http";

export const REFRESH_COOKIE_NAME = "aisales_refresh";
export const REFRESH_COOKIE_PATH = "/api/v1/auth";
export const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
export const FOURTEEN_DAYS_SECONDS = 14 * 24 * 60 * 60;
export const ACCESS_TOKEN_EXPIRY_SECONDS = 900;

type CookieRequest = Pick<HttpRequest, "headers"> & { protocol?: string };

export function isSecureCookie(req?: CookieRequest): boolean {
  if (env.COOKIE_SECURE !== undefined) {
    return env.COOKIE_SECURE === "true";
  }
  // Tests skip schema validation and may unset PUBLIC_API_URL on process.env.
  const publicApiUrl = env.PUBLIC_API_URL;
  if (typeof publicApiUrl === "string" && publicApiUrl.startsWith("https://")) {
    return true;
  }
  if (typeof publicApiUrl === "string" && publicApiUrl.startsWith("http://")) {
    return false;
  }
  if (req) {
    return isSecureRequest(req);
  }
  return false;
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }
  const cookies: Record<string, string> = {};
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(val);
      } catch {
        cookies[key] = val;
      }
    }
  }
  return cookies;
}

export function extractRefreshToken(
  req: CookieRequest & { cookies?: unknown },
): string | undefined {
  // `@fastify/cookie` populates `request.cookies`; the header parse is the
  // fallback for contexts where the plugin is not registered.
  const rawCookies = req.cookies;
  if (typeof rawCookies === "object" && rawCookies !== null && REFRESH_COOKIE_NAME in rawCookies) {
    const value = (rawCookies as Record<string, unknown>)[REFRESH_COOKIE_NAME];
    if (typeof value === "string") {
      return value;
    }
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[REFRESH_COOKIE_NAME];
}

export function extractBearerToken(authHeader?: string): string | undefined {
  if (!authHeader || typeof authHeader !== "string") {
    return undefined;
  }
  const parts = authHeader.trim().split(" ");
  if (parts.length === 2 && parts[0]?.toLowerCase() === "bearer" && parts[1]) {
    return parts[1];
  }
  return undefined;
}

/**
 * Refresh cookie attributes.
 *
 * `maxAge` is in **seconds**: `@fastify/cookie` forwards it to `Set-Cookie`
 * `Max-Age` verbatim, unlike Express's `res.cookie`, which took milliseconds
 * and divided by 1000. Passing the millisecond value here would emit a cookie
 * that lives ~38 years.
 */
export function getRefreshCookieOptions(req?: CookieRequest): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: isSecureCookie(req),
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    maxAge: FOURTEEN_DAYS_SECONDS,
  };
}

export function getClearCookieOptions(req?: CookieRequest): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: isSecureCookie(req),
    sameSite: "lax",
    path: REFRESH_COOKIE_PATH,
    maxAge: 0,
  };
}
