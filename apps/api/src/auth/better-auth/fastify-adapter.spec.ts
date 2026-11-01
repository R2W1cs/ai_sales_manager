import type { FastifyReply, FastifyRequest } from "fastify";

import {
  fromNodeHeaders,
  resolveRequestUrl,
  sendWebResponse,
  toFastifyHandler,
  toWebHeaders,
  toWebRequest,
} from "./fastify-adapter";

function fakeRequest(overrides: Partial<FastifyRequest> & { rawBody?: Buffer } = {}) {
  return {
    method: "GET",
    url: "/api/auth/get-session",
    protocol: "http",
    headers: { host: "api.test" },
    ...overrides,
  } as unknown as FastifyRequest & { rawBody?: Buffer };
}

function fakeReply() {
  const headers: [string, string][] = [];
  const state = { status: 0, payload: undefined as unknown };
  const reply = {
    status: (code: number) => {
      state.status = code;
      return reply;
    },
    header: (key: string, value: string) => {
      headers.push([key, value]);
      return reply;
    },
    send: (payload: unknown) => {
      state.payload = payload;
      return reply;
    },
  };
  return { reply: reply as unknown as FastifyReply, headers, state };
}

describe("better auth fastify adapter", () => {
  describe("toWebHeaders", () => {
    it("returns empty Headers for undefined", () => {
      expect(toWebHeaders(undefined)).toBeInstanceOf(Headers);
    });

    it("passes an existing Headers object through", () => {
      const headers = new Headers({ "x-test": "value" });
      expect(toWebHeaders(headers)).toBe(headers);
    });

    it("appends array-valued headers instead of overwriting", () => {
      const headers = toWebHeaders({
        authorization: "Bearer 123",
        "set-cookie": ["a=1", "b=2"],
      });
      expect(headers.get("authorization")).toBe("Bearer 123");
      expect(headers.getSetCookie()).toEqual(["a=1", "b=2"]);
    });

    it("is exported under the fromNodeHeaders name for non-Fastify callers", () => {
      expect(fromNodeHeaders).toBe(toWebHeaders);
    });
  });

  describe("resolveRequestUrl", () => {
    it("builds an absolute url from protocol and host", () => {
      expect(resolveRequestUrl(fakeRequest()).toString()).toBe(
        "http://api.test/api/auth/get-session",
      );
    });

    it("prefers proxy forwarding headers so OAuth callbacks match the public origin", () => {
      const url = resolveRequestUrl(
        fakeRequest({
          headers: {
            host: "10.0.0.5:3001",
            "x-forwarded-proto": "https",
            "x-forwarded-host": "api.example.com",
          },
        }),
      );
      expect(url.toString()).toBe("https://api.example.com/api/auth/get-session");
    });

    it("takes the first entry when a forwarding header is a list", () => {
      const url = resolveRequestUrl(
        fakeRequest({
          headers: {
            host: "internal",
            "x-forwarded-proto": "https, http",
            "x-forwarded-host": "api.example.com, internal",
          },
        }),
      );
      expect(url.origin).toBe("https://api.example.com");
    });
  });

  describe("toWebRequest", () => {
    it("omits a body for GET", () => {
      expect(toWebRequest(fakeRequest()).body).toBeNull();
    });

    it("forwards the raw bytes verbatim for POST", async () => {
      // Byte fidelity matters: re-serializing the parsed body would break
      // form-encoded payloads and any signature computed over the raw bytes.
      const raw = Buffer.from('{"email":"a@b.co","note":"wörld"}', "utf8");
      const request = toWebRequest(
        fakeRequest({
          method: "POST",
          url: "/api/auth/sign-in/email",
          headers: { host: "api.test", "content-type": "application/json" },
          rawBody: raw,
        }),
      );

      expect(request.method).toBe("POST");
      await expect(request.text()).resolves.toBe(raw.toString("utf8"));
    });

    it("preserves a form-urlencoded body without converting it to JSON", async () => {
      const raw = Buffer.from("email=a%40b.co&password=secret", "utf8");
      const request = toWebRequest(
        fakeRequest({
          method: "POST",
          url: "/api/auth/sign-in/email",
          headers: {
            host: "api.test",
            "content-type": "application/x-www-form-urlencoded",
          },
          rawBody: raw,
        }),
      );

      await expect(request.text()).resolves.toBe("email=a%40b.co&password=secret");
    });

    it("sends no body when raw bytes are absent", () => {
      const request = toWebRequest(fakeRequest({ method: "POST" }));
      expect(request.body).toBeNull();
    });
  });

  describe("sendWebResponse", () => {
    it("copies status, headers and body onto the reply", async () => {
      const { reply, headers, state } = fakeReply();
      const response = new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });

      await sendWebResponse(reply, response);

      expect(state.status).toBe(201);
      expect(headers).toContainEqual(["content-type", "application/json"]);
      expect(state.payload).toBe('{"ok":true}');
    });

    it("forwards every Set-Cookie separately", async () => {
      // Sign-out clears three cookies; collapsing them would leave sessions
      // alive in the browser.
      const { reply, headers } = fakeReply();
      const response = new Response(null, { status: 200 });
      response.headers.append("set-cookie", "a=1; Path=/; HttpOnly");
      response.headers.append("set-cookie", "b=2; Path=/; HttpOnly");
      response.headers.append("set-cookie", "c=3; Path=/; HttpOnly");

      await sendWebResponse(reply, response);

      const cookies = headers.filter(([key]) => key === "set-cookie").map(([, value]) => value);
      expect(cookies).toEqual([
        "a=1; Path=/; HttpOnly",
        "b=2; Path=/; HttpOnly",
        "c=3; Path=/; HttpOnly",
      ]);
    });

    it("sends a null payload for an empty response body", async () => {
      const { reply, state } = fakeReply();
      await sendWebResponse(reply, new Response(null, { status: 204 }));
      expect(state.status).toBe(204);
      expect(state.payload).toBeNull();
    });
  });

  describe("toFastifyHandler", () => {
    it("pipes the Better Auth handler through to the reply", async () => {
      const { reply, state } = fakeReply();
      const handler = toFastifyHandler((request) => {
        expect(request.url).toContain("/api/auth/get-session");
        return Promise.resolve(new Response(JSON.stringify({ session: null }), { status: 200 }));
      });

      await handler(fakeRequest(), reply);

      expect(state.status).toBe(200);
      expect(state.payload).toBe('{"session":null}');
    });
  });
});
