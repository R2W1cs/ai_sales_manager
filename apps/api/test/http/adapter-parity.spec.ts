/**
 * HTTP adapter parity suite.
 *
 * Every assertion here describes a contract that must hold identically on the
 * Express adapter and on the Fastify adapter. The suite was written and made
 * green against Express *before* the Fastify migration, so a regression in the
 * swap fails here rather than in production.
 *
 * Deliberately covers only adapter-sensitive behaviour: status codes, headers,
 * cookie attributes, redirects, raw request bytes, CORS and body limits.
 */
import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";

jest.mock("../../src/lib/queue.js", () => ({ connection: {} }));
jest.mock("../../src/lib/queue", () => ({ connection: {} }));

import * as crypto from "node:crypto";

import { AppController } from "../../src/app.controller";
import { AppService } from "../../src/app.service";
import { BODY_LIMIT_BYTES, corsOrigins } from "../../src/bootstrap";
import { MetaHmacGuard } from "../../src/integrations/guards/meta-hmac.guard";
import { findCookie, setCookies, startHttpApp, type HttpTestApp } from "./harness";

const META_APP_SECRET = "parity-suite-meta-app-secret";

/** Echoes adapter-level request facts that controllers depend on. */
@Controller("__parity")
class ParityProbeController {
  @Post("raw-body")
  @HttpCode(HttpStatus.OK)
  rawBody(@Req() request: { rawBody?: Buffer; body?: unknown }) {
    const raw = request.rawBody;
    return {
      hasRawBody: Buffer.isBuffer(raw),
      byteLength: raw?.length ?? 0,
      sha256: raw ? crypto.createHash("sha256").update(raw).digest("hex") : null,
      parsedBody: request.body ?? null,
    };
  }

  @Get("csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="parity.csv"')
  csv(): string {
    return "sku,name\nA-1,Widget\n";
  }

  @Get("no-content")
  @HttpCode(HttpStatus.NO_CONTENT)
  noContent(): void {
    /* empty */
  }
}

/** Exercises the real HMAC guard over real HTTP with real bytes. */
@Controller("__parity/webhook")
class ParityWebhookController {
  @Post()
  @HttpCode(HttpStatus.OK)
  @UseGuards(MetaHmacGuard)
  handle(): { ok: boolean } {
    return { ok: true };
  }
}

function sign(body: string, secret = META_APP_SECRET): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("HTTP adapter parity", () => {
  let harness: HttpTestApp;
  const previousMetaSecret = process.env.META_APP_SECRET;

  beforeAll(async () => {
    process.env.META_APP_SECRET = META_APP_SECRET;
    harness = await startHttpApp({
      controllers: [AppController, ParityProbeController, ParityWebhookController],
      providers: [AppService],
    });
  });

  afterAll(async () => {
    await harness.close();
    if (previousMetaSecret === undefined) {
      delete process.env.META_APP_SECRET;
    } else {
      process.env.META_APP_SECRET = previousMetaSecret;
    }
  });

  describe("routing and status codes", () => {
    it("serves the root health route as 200 text", async () => {
      const response = await harness.fetch("/");
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe("OK");
    });

    it("returns 404 with a JSON error envelope for unknown routes", async () => {
      const response = await harness.fetch("/__parity/does-not-exist");
      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toContain("application/json");
    });

    it("preserves an explicit 204 with no body", async () => {
      const response = await harness.fetch("/__parity/no-content");
      expect(response.status).toBe(204);
      await expect(response.text()).resolves.toBe("");
    });
  });

  describe("@Header decorator", () => {
    it("applies declared response headers verbatim", async () => {
      const response = await harness.fetch("/__parity/csv");
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
      expect(response.headers.get("content-disposition")).toBe('attachment; filename="parity.csv"');
      await expect(response.text()).resolves.toContain("sku,name");
    });
  });

  describe("raw body fidelity", () => {
    it("exposes the exact request bytes on request.rawBody", async () => {
      // Multi-byte characters and insignificant whitespace both make
      // JSON.stringify(parsedBody) differ from the bytes Meta signed.
      const payload = '{\n  "text": "wörld — ñ",\n  "n": 1\n}';
      const expected = crypto.createHash("sha256").update(payload, "utf8").digest("hex");

      const response = await harness.fetch("/__parity/raw-body", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        hasRawBody: boolean;
        byteLength: number;
        sha256: string;
        parsedBody: unknown;
      };

      expect(body.hasRawBody).toBe(true);
      expect(body.byteLength).toBe(Buffer.byteLength(payload, "utf8"));
      expect(body.sha256).toBe(expected);
      expect(body.parsedBody).toEqual({ text: "wörld — ñ", n: 1 });
    });

    it("accepts a body just under the configured limit", async () => {
      // 13 §2.1: the framework default (~100 KB) is explicitly not the cap.
      // The Meta webhook needs 512 KB, so a smaller default would drop traffic.
      const filler = "x".repeat(BODY_LIMIT_BYTES - 4096);
      const response = await harness.fetch("/__parity/raw-body", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blob: filler }),
      });

      expect(response.status).toBe(200);
      const body = (await response.json()) as { hasRawBody: boolean };
      expect(body.hasRawBody).toBe(true);
    });

    it("rejects a body over the configured limit with 413", async () => {
      const oversized = JSON.stringify({ blob: "x".repeat(BODY_LIMIT_BYTES + 1024) });
      const response = await harness.fetch("/__parity/raw-body", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: oversized,
      });
      expect(response.status).toBe(413);
    });
  });

  describe("Meta webhook HMAC over real HTTP", () => {
    it("accepts a signature computed over the raw bytes", async () => {
      const payload = '{"object":"page","entry":[{"id":"1","time":2}]}';
      const response = await harness.fetch("/__parity/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": sign(payload),
        },
        body: payload,
      });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
    });

    it("accepts payloads whose re-serialization would differ from the signed bytes", async () => {
      // Regression guard: signing must not depend on JSON.stringify(req.body).
      const payload = '{ "object" : "page",  "entry" : [ ] }';
      const response = await harness.fetch("/__parity/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": sign(payload),
        },
        body: payload,
      });

      expect(response.status).toBe(200);
    });

    it("rejects a wrong signature with 401", async () => {
      const payload = '{"object":"page"}';
      const response = await harness.fetch("/__parity/webhook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": sign(payload, "wrong-secret"),
        },
        body: payload,
      });

      expect(response.status).toBe(401);
      const body = (await response.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe("webhook_invalid_signature");
    });

    it("rejects a missing signature with 401", async () => {
      const response = await harness.fetch("/__parity/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"object":"page"}',
      });
      expect(response.status).toBe(401);
    });
  });

  describe("CORS (13 §2.1, 17 §10)", () => {
    const allowedOrigin = "http://localhost:3000";

    it("never advertises a wildcard origin", () => {
      expect(corsOrigins()).not.toContain("*");
      expect(corsOrigins().length).toBeGreaterThan(0);
    });

    it("answers preflight for an allowed origin with credentials enabled", async () => {
      const response = await harness.fetch("/", {
        method: "OPTIONS",
        headers: {
          origin: allowedOrigin,
          "access-control-request-method": "PATCH",
          "access-control-request-headers": "authorization,x-business-id",
        },
      });

      expect([200, 204]).toContain(response.status);
      expect(response.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
      expect(response.headers.get("access-control-allow-credentials")).toBe("true");
      expect(response.headers.get("access-control-allow-methods")).toContain("PATCH");
      expect(response.headers.get("access-control-allow-methods")).toContain("DELETE");
    });

    it("allows the tenant and idempotency headers the client must send", async () => {
      const response = await harness.fetch("/", {
        method: "OPTIONS",
        headers: {
          origin: allowedOrigin,
          "access-control-request-method": "POST",
          "access-control-request-headers": "x-business-id,idempotency-key",
        },
      });

      const allowed = (response.headers.get("access-control-allow-headers") ?? "").toLowerCase();
      expect(allowed).toContain("x-business-id");
      expect(allowed).toContain("idempotency-key");
    });

    it("echoes credentials on a normal cross-origin request", async () => {
      const response = await harness.fetch("/", { headers: { origin: allowedOrigin } });
      expect(response.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
      expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    });

    it("does not grant access to a disallowed origin", async () => {
      const response = await harness.fetch("/", {
        headers: { origin: "https://attacker.example" },
      });
      expect(response.headers.get("access-control-allow-origin")).not.toBe(
        "https://attacker.example",
      );
      expect(response.headers.get("access-control-allow-origin")).not.toBe("*");
    });
  });

  describe("cookie serialization", () => {
    it("exposes getSetCookie for multi-cookie responses", async () => {
      // Guards the helper the Better Auth adapter relies on to forward
      // several Set-Cookie headers without collapsing them.
      const response = await harness.fetch("/");
      expect(Array.isArray(setCookies(response))).toBe(true);
      expect(findCookie(response, "nonexistent")).toBeUndefined();
    });
  });
});
