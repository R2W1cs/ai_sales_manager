import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ForbiddenException, Injectable } from "@nestjs/common";

import { corsOrigins } from "../../bootstrap";
import { requestPath, type HttpRequest } from "../core/http";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function extractOrigin(urlOrOrigin: string | undefined): string | null {
  if (!urlOrOrigin || typeof urlOrOrigin !== "string") return null;
  try {
    return new URL(urlOrOrigin).origin;
  } catch {
    return null;
  }
}

/**
 * Explicit CSRF guard for cookie-authenticated NestJS state-changing endpoints
 * (`POST`, `PATCH`, `PUT`, `DELETE`).
 *
 * - Safe methods (`GET`, `HEAD`, `OPTIONS`) and `/api/auth/*` (handled by Better Auth's
 *   `trustedOrigins` / `originCheck`) are skipped.
 * - Cookie-less requests (webhooks, anonymous widget calls, pure Bearer API calls) pass.
 * - Any cookie-bearing mutation rejects `Sec-Fetch-Site: cross-site`, validates `Origin` /
 *   `Referer` against configured first-party origins, and requires `Origin` or `Referer`.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<HttpRequest>();
    const method = (req.method || "GET").toUpperCase();

    if (SAFE_METHODS.has(method)) {
      return true;
    }

    const reqPath = requestPath(req);
    if (reqPath.startsWith("/api/auth")) {
      return true;
    }

    const hasCookie =
      typeof req.headers.cookie === "string" && req.headers.cookie.trim().length > 0;
    if (!hasCookie) {
      return true;
    }

    const secFetchSite = req.headers["sec-fetch-site"];
    const fetchSiteValue = Array.isArray(secFetchSite) ? secFetchSite[0] : secFetchSite;
    if (typeof fetchSiteValue === "string" && fetchSiteValue.toLowerCase() === "cross-site") {
      throw new ForbiddenException({
        error: {
          code: "csrf_rejected",
          message: "Cross-site state-changing request rejected",
        },
      });
    }

    const allowedOrigins = new Set(corsOrigins());
    const rawOrigin = req.headers.origin;
    const originValue = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;

    if (typeof originValue === "string" && originValue.length > 0) {
      const normalized = originValue.replace(/\/$/, "");
      if (!allowedOrigins.has(normalized)) {
        throw new ForbiddenException({
          error: {
            code: "csrf_rejected",
            message: "Untrusted request origin",
          },
        });
      }
      return true;
    }

    const rawReferer = req.headers.referer;
    const refererValue = Array.isArray(rawReferer) ? rawReferer[0] : rawReferer;
    const refererOrigin = extractOrigin(refererValue);
    if (refererOrigin) {
      if (!allowedOrigins.has(refererOrigin)) {
        throw new ForbiddenException({
          error: {
            code: "csrf_rejected",
            message: "Untrusted request referer",
          },
        });
      }
      return true;
    }

    throw new ForbiddenException({
      error: {
        code: "csrf_rejected",
        message: "Origin or Referer header required for cookie-authenticated mutations",
      },
    });
  }
}
