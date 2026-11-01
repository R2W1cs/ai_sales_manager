import type { AddressInfo } from "node:net";

import type { ModuleMetadata } from "@nestjs/common";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { TestingModuleBuilder } from "@nestjs/testing";
import { Test } from "@nestjs/testing";

import { configureApp, createHttpAdapter, nestAppOptions } from "../../src/bootstrap";

/**
 * Adapter-agnostic HTTP integration harness.
 *
 * These tests speak real HTTP over a loopback socket instead of hand-mocking
 * `req`/`res`, so they assert the contract the HTTP adapter actually produces:
 * status codes, headers, `Set-Cookie` attributes, redirects and raw bytes.
 *
 * The app is built through `src/bootstrap.ts`, so the same suite runs unchanged
 * on either adapter and proves the migration preserved behaviour.
 */
export interface HttpTestApp {
  app: NestFastifyApplication;
  /** Absolute URL for a path on the ephemeral test server. */
  url: (path: string) => string;
  /** `fetch` with redirects disabled so `Location`/302 can be asserted. */
  fetch: (path: string, init?: RequestInit) => Promise<Response>;
  close: () => Promise<void>;
}

export async function startHttpApp(
  metadata: ModuleMetadata,
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<HttpTestApp> {
  let builder = Test.createTestingModule(metadata);
  if (customize) {
    builder = customize(builder);
  }

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    createHttpAdapter(),
    nestAppOptions(),
  );

  await configureApp(app);
  await app.init();
  // Fastify registers routes on ready(); Nest defers that to listen().
  await app.listen(0, "127.0.0.1");

  const server = app.getHttpServer() as { address(): AddressInfo | string | null };
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  return {
    app,
    url: (path: string) => `${base}${path}`,
    fetch: (path: string, init?: RequestInit) =>
      fetch(`${base}${path}`, { redirect: "manual", ...init }),
    close: async () => {
      await app.close();
    },
  };
}

/** Splits a `Set-Cookie` response into individual cookie strings. */
export function setCookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

/** Finds one cookie by name and parses its attributes. */
export function findCookie(
  response: Response,
  name: string,
): { value: string; attributes: Record<string, string> } | undefined {
  const raw = setCookies(response).find((cookie) => cookie.startsWith(`${name}=`));
  if (!raw) return undefined;

  const [pair, ...rest] = raw.split(";");
  const attributes: Record<string, string> = {};
  for (const segment of rest) {
    const [key, ...valueParts] = segment.trim().split("=");
    if (key) {
      attributes[key.toLowerCase()] = valueParts.join("=");
    }
  }

  return { value: (pair ?? "").slice(name.length + 1), attributes };
}
