/**
 * Proxy-trust policy (NFR-SEC-09, 18 §1).
 *
 * `AuthThrottlerGuard` rate limits on `request.ip`, which Fastify derives from
 * `X-Forwarded-For` when `trustProxy` is on. Trusting that header without a
 * proxy in front lets a caller forge and rotate it to bypass the auth limit, so
 * the default must be conservative.
 */
import { shouldTrustProxy } from "./bootstrap";

describe("shouldTrustProxy", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousTrustProxy = process.env.TRUST_PROXY;

  afterEach(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;

    if (previousTrustProxy === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previousTrustProxy;
  });

  it("trusts the proxy in production, where the ALB overwrites the headers", () => {
    process.env.NODE_ENV = "production";
    delete process.env.TRUST_PROXY;
    expect(shouldTrustProxy()).toBe(true);
  });

  it("does not trust forwarded headers in development", () => {
    process.env.NODE_ENV = "development";
    delete process.env.TRUST_PROXY;
    expect(shouldTrustProxy()).toBe(false);
  });

  it("does not trust forwarded headers in test", () => {
    process.env.NODE_ENV = "test";
    delete process.env.TRUST_PROXY;
    expect(shouldTrustProxy()).toBe(false);
  });

  it("allows an explicit opt-in for a proxied non-production environment", () => {
    process.env.NODE_ENV = "development";
    process.env.TRUST_PROXY = "true";
    expect(shouldTrustProxy()).toBe(true);
  });

  it("allows an explicit opt-out in production, e.g. a direct-exposure incident", () => {
    process.env.NODE_ENV = "production";
    process.env.TRUST_PROXY = "false";
    expect(shouldTrustProxy()).toBe(false);
  });
});
