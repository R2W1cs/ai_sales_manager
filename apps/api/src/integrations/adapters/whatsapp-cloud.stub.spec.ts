import * as fs from "node:fs";
import * as path from "node:path";

import { WhatsAppCloudStubAdapter } from "./whatsapp-cloud.stub";

/**
 * Automated TDD Test Suite for T-INT-06 — WhatsApp integration adapter stub & feature gate
 */
describe("WhatsApp integration adapter stub & feature gate (T-INT-06)", () => {
  let adapter: WhatsAppCloudStubAdapter;
  const originalEnv = process.env.WHATSAPP_ENABLED;

  beforeEach(() => {
    adapter = new WhatsAppCloudStubAdapter();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.WHATSAPP_ENABLED = originalEnv;
    } else {
      delete process.env.WHATSAPP_ENABLED;
    }
  });

  it("Clean Dependencies: Verify zero unofficial WhatsApp dependencies exist in lockfile and package.json files", () => {
    const forbiddenPackages = [
      "baileys",
      "@adiwajshing/baileys",
      "@whiskeysockets/baileys",
      "whatsapp-web.js",
      "venom-bot",
      "wppconnect",
      "puppeteer-extra",
      "playwright-aws-lambda",
    ];

    const repoRoot = path.resolve(__dirname, "../../../../../");

    // Check root and workspace package.json files
    const packageJsonPaths = [
      path.join(repoRoot, "package.json"),
      path.join(repoRoot, "apps/api/package.json"),
      path.join(repoRoot, "apps/web/package.json"),
      path.join(repoRoot, "packages/shared/package.json"),
      path.join(repoRoot, "packages/database/package.json"),
    ];

    for (const p of packageJsonPaths) {
      if (fs.existsSync(p)) {
        const pkgContent = JSON.parse(fs.readFileSync(p, "utf-8"));
        const allDeps = {
          ...pkgContent.dependencies,
          ...pkgContent.devDependencies,
          ...pkgContent.peerDependencies,
        };

        for (const forbidden of forbiddenPackages) {
          expect(allDeps[forbidden]).toBeUndefined();
        }
      }
    }

    // Check pnpm-lock.yaml if exists
    const lockfilePath = path.join(repoRoot, "pnpm-lock.yaml");
    if (fs.existsSync(lockfilePath)) {
      const lockfileContent = fs.readFileSync(lockfilePath, "utf-8");
      for (const forbidden of forbiddenPackages) {
        const hasForbidden =
          lockfileContent.includes(`/${forbidden}@`) ||
          lockfileContent.includes(`"${forbidden}":`) ||
          lockfileContent.includes(`'${forbidden}':`) ||
          lockfileContent.includes(`${forbidden}:`);
        expect(hasForbidden).toBe(false);
      }
    }
  });

  it("should implement ChannelAdapter properties correctly", () => {
    expect(adapter.channel).toBe("whatsapp");
    expect(adapter.outboundLimiter).toBeDefined();
    expect(adapter.outboundLimiter.max).toBe(0);
    expect(adapter.outboundLimiter.durationMs).toBe(1000);
  });

  it("should enforce feature gate when WHATSAPP_ENABLED is false or unset", async () => {
    delete process.env.WHATSAPP_ENABLED;

    // Inbound messages should be dropped / return empty list
    const inbound = adapter.mapInbound({ entry: [{ changes: [] }] });
    expect(inbound).toEqual([]);

    // Outbound should return feature_disabled
    const outboundResult = await adapter.send(
      {
        channel: "whatsapp",
        recipientPlatformUserId: "user_456",
        text: "Hello",
      },
      "dummy_token",
    );

    expect(outboundResult.ok).toBe(false);
    expect(outboundResult.retryable).toBe(false);
    expect(outboundResult.providerCode).toBe("feature_disabled");
    expect(outboundResult.message).toContain("feature_disabled");
  });

  it("should delegate to Cloud API when WHATSAPP_ENABLED is true", async () => {
    process.env.WHATSAPP_ENABLED = "true";

    const inbound = adapter.mapInbound({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_1",
          changes: [
            {
              value: {
                metadata: { phone_number_id: "PHONE_1" },
                messages: [
                  {
                    from: "21650000000",
                    id: "wamid.TEST",
                    timestamp: "1700000000",
                    type: "text",
                    text: { body: "salem" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(inbound).toHaveLength(1);
    expect(inbound[0]?.text).toBe("salem");

    const fetchMock = jest.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.OUT" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const outboundResult = await adapter.send(
      {
        channel: "whatsapp",
        recipientPlatformUserId: "21650000000",
        text: "Hello",
        pageId: "PHONE_1",
      },
      "dummy_token",
    );

    expect(outboundResult.ok).toBe(true);
    expect(outboundResult.externalMessageId).toBe("wamid.OUT");
    expect(fetchMock).toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
