import type { FastifyReply, FastifyRequest } from "fastify";

import {
  fromNodeHeaders,
  resolveRequestUrl,
  sendWebResponse,
  stripTrustDeviceCookies,
  toWebHeaders,
  toWebRequest,
} from "./fastify-adapter";

function makeReq(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    method: "GET",
    url: "/api/auth/get-session",
    raw: { url: "/api/auth/get-session" },
    protocol: "http",
    hostname: "localhost:3001",
    headers: { host: "localhost:3001" },
    ...overrides,
  } as unknown as FastifyRequest;
}

describe("better auth fastify adapter", () => {
  const origTrustProxy = process.env.TRUST_PROXY;

  afterEach(() => {
    if (origTrustProxy === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = origTrustProxy;
    }
  });

  describe("stripTrustDeviceCookies", () => {
    it("removes better-auth trust_device cookies while preserving session cookies", () => {
      const cleaned = stripTrustDeviceCookies(
        "better-auth.session_token=sess123; better-auth.trust_device=td999; __Secure-better-auth.trust_device=td888; theme=dark",
      );

      expect(cleaned).toContain("better-auth.session_token=sess123");
      expect(cleaned).toContain("theme=dark");
      expect(cleaned).not.toContain("trust_device");
    });

    it("handles a solitary trust_device cookie cleanly", () => {
      expect(stripTrustDeviceCookies("better-auth.trust_device=only")).toBe("");
    });
  });

  describe("toWebHeaders & fromNodeHeaders & toWebRequest", () => {
    it("converts Node incoming headers and strips trust_device cookies when stripTrustDevice is true", () => {
      const headers = toWebHeaders(
        {
          host: "api.example.com",
          cookie: "better-auth.session_token=abc; better-auth.trust_device=evil_trust; theme=light",
          "x-custom": ["a", "b"],
        },
        { stripTrustDevice: true },
      );

      expect(headers.get("host")).toBe("api.example.com");
      expect(headers.get("cookie")).toBe("better-auth.session_token=abc; theme=light");
      expect(headers.get("x-custom")).toBe("a, b");
    });

    it("toWebRequest strips inbound trust_device cookies before reaching Better Auth", () => {
      const req = makeReq({
        headers: {
          host: "localhost:3001",
          cookie: "__Secure-better-auth.trust_device=bypass; better-auth.session_token=tok1",
        },
      });
      const webReq = toWebRequest(req);
      expect(webReq.headers.get("cookie")).toBe("better-auth.session_token=tok1");
    });

    it("fromNodeHeaders wraps plain Node headers", () => {
      const headers = fromNodeHeaders({
        cookie: "better-auth.session_token=tok1",
      });
      expect(headers.get("cookie")).toBe("better-auth.session_token=tok1");
    });
  });

  describe("resolveRequestUrl", () => {
    it("ignores x-forwarded-* headers when TRUST_PROXY is not enabled", () => {
      process.env.TRUST_PROXY = "false";
      const req = makeReq({
        protocol: "http",
        hostname: "10.0.0.5:3001",
        headers: {
          host: "10.0.0.5:3001",
          "x-forwarded-host": "evil.attacker.com",
          "x-forwarded-proto": "https",
        },
      });

      const url = resolveRequestUrl(req);
      expect(url.toString()).toBe("http://10.0.0.5:3001/api/auth/get-session");
    });

    it("uses proxy forwarding headers only when TRUST_PROXY=true", () => {
      process.env.TRUST_PROXY = "true";
      const req = makeReq({
        protocol: "http",
        hostname: "10.0.0.5:3001",
        headers: {
          host: "10.0.0.5:3001",
          "x-forwarded-host": "api.example.com",
          "x-forwarded-proto": "https",
        },
      });

      const url = resolveRequestUrl(req);
      expect(url.toString()).toBe("https://api.example.com/api/auth/get-session");
    });

    it("takes the first entry when a forwarding header is a comma-separated list", () => {
      process.env.TRUST_PROXY = "true";
      const req = makeReq({
        protocol: "http",
        hostname: "internal",
        headers: {
          host: "internal",
          "x-forwarded-host": "api.example.com, proxy.internal",
          "x-forwarded-proto": "https, http",
        },
      });

      const url = resolveRequestUrl(req);
      expect(url.origin).toBe("https://api.example.com");
    });
  });

  describe("sendWebResponse", () => {
    it("replaces outbound trust_device cookies with immediate Max-Age=0 clearing headers while keeping session cookies", async () => {
      const headersSent: Array<[string, string | string[]]> = [];
      let statusSent = 0;
      let payloadSent: string | null = null;

      const reply = {
        status(code: number) {
          statusSent = code;
          return this;
        },
        header(name: string, val: string | string[]) {
          headersSent.push([name.toLowerCase(), val]);
          return this;
        },
        async send(body: string | null) {
          payloadSent = body;
          return this;
        },
      } as unknown as FastifyReply;

      const resHeaders = new Headers();
      resHeaders.append("set-cookie", "better-auth.session_token=s1; Path=/; HttpOnly");
      resHeaders.append("set-cookie", "better-auth.trust_device=td1; Path=/; HttpOnly");
      resHeaders.set("content-type", "application/json");

      const webRes = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: resHeaders,
      });

      await sendWebResponse(reply, webRes);

      expect(statusSent).toBe(200);
      expect(payloadSent).toBe(JSON.stringify({ ok: true }));
      const setCookies = headersSent.filter(([k]) => k === "set-cookie").map(([, v]) => String(v));
      expect(setCookies.some((c) => c.includes("session_token=s1"))).toBe(true);
      expect(setCookies.some((c) => c.includes("trust_device=td1"))).toBe(false);
      expect(
        setCookies.some((c) => c.includes("better-auth.trust_device=;") && c.includes("Max-Age=0")),
      ).toBe(true);
    });
  });
});
