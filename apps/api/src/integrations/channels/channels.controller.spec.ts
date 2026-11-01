import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";

import { MetaOAuthService } from "../meta/meta-oauth.service";
import { ChannelsController } from "./channels.controller";
import { ChannelsService, type ChannelAccountSummary } from "./channels.service";

interface DbChannelAccount {
  id: string;
  business_id: string;
  channel: string;
  external_account_id: string;
  status: string;
  credentials_ref?: string;
  verification_status?: string | null;
  display_name?: string | null;
  page_id?: string | null;
  ig_user_id?: string | null;
  waba_id?: string | null;
  phone_number_id?: string | null;
  authorized_meta_user_id?: string | null;
  token_expires_at?: Date | null;
  last_inbound_at?: Date | null;
  last_error?: string | null;
  last_token_check_at?: Date | null;
  disconnected_at?: Date | null;
  connected_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface DbSubscription {
  id: string;
  business_id: string;
  status: string;
  plan?: {
    id: string;
    name: string;
    limits?: Record<string, unknown>;
  };
}

interface DbFeatureFlag {
  business_id: string | null;
  feature: string;
  enabled: boolean;
}

describe("Meta OAuth & Channel accounts management (WhatsApp / Instagram / Messenger) (T-INT-01)", () => {
  let controller: ChannelsController;
  let channelsService: ChannelsService;
  let metaOAuthService: MetaOAuthService;
  let mockPrisma: {
    channelAccount: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    subscription: {
      findFirst: jest.Mock;
    };
    featureFlag: {
      findFirst: jest.Mock;
    };
    _store: {
      dbChannelAccounts: DbChannelAccount[];
      dbSubscriptions: DbSubscription[];
      dbFeatureFlags: DbFeatureFlag[];
    };
  };

  const mockBusinessId = "biz-12345678-0000-0000-0000-000000000001";

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-long!";
    process.env.META_APP_ID = "test_meta_app_id";
    process.env.META_APP_SECRET = "test_meta_app_secret";
    process.env.BETTER_AUTH_SECRET = "test-jwt-secret-key-32-chars-long!";

    const dbChannelAccounts: DbChannelAccount[] = [];
    const dbSubscriptions: DbSubscription[] = [];
    const dbFeatureFlags: DbFeatureFlag[] = [];

    mockPrisma = {
      channelAccount: {
        findMany: jest.fn(({ where }: { where: { business_id: string } }) => {
          return Promise.resolve(
            dbChannelAccounts.filter((a) => a.business_id === where.business_id),
          );
        }),
        findUnique: jest.fn(
          ({
            where,
          }: {
            where: {
              business_id_channel_external_account_id?: {
                business_id: string;
                channel: string;
                external_account_id: string;
              };
              id?: string;
            };
          }) => {
            const key = where.business_id_channel_external_account_id;
            if (key) {
              const found = dbChannelAccounts.find(
                (a) =>
                  a.business_id === key.business_id &&
                  a.channel === key.channel &&
                  a.external_account_id === key.external_account_id,
              );
              return Promise.resolve(found ?? null);
            }
            const found = dbChannelAccounts.find((a) => a.id === where.id);
            return Promise.resolve(found ?? null);
          },
        ),
        findFirst: jest.fn(
          ({
            where,
          }: {
            where: {
              id?: string;
              business_id?: string;
            };
          }) => {
            const found = dbChannelAccounts.find(
              (a) =>
                (!where.id || a.id === where.id) &&
                (!where.business_id || a.business_id === where.business_id),
            );
            return Promise.resolve(found ?? null);
          },
        ),
        count: jest.fn(
          ({
            where,
          }: {
            where: {
              business_id: string;
              status?: string;
            };
          }) => {
            const count = dbChannelAccounts.filter(
              (a) =>
                a.business_id === where.business_id && (!where.status || a.status === where.status),
            ).length;
            return Promise.resolve(count);
          },
        ),
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          const record: DbChannelAccount = {
            id: `chan-${Date.now().toString()}-${Math.random().toString(36).substring(2, 7)}`,
            business_id: data.business_id as string,
            channel: data.channel as string,
            external_account_id: data.external_account_id as string,
            status: data.status as string,
            credentials_ref: data.credentials_ref as string | undefined,
            display_name: (data.displayName ?? data.display_name ?? null) as string | null,
            page_id: data.page_id as string | null | undefined,
            ig_user_id: data.ig_user_id as string | null | undefined,
            waba_id: data.waba_id as string | null | undefined,
            phone_number_id: data.phone_number_id as string | null | undefined,
            authorized_meta_user_id: data.authorized_meta_user_id as string | null | undefined,
            verification_status: (data.verification_status ?? null) as string | null,
            token_expires_at: data.token_expires_at as Date | null | undefined,
            last_inbound_at: null,
            last_error: null,
            last_token_check_at: null,
            disconnected_at: null,
            connected_at: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          };
          dbChannelAccounts.push(record);
          return Promise.resolve(record);
        }),
        update: jest.fn(
          ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const current = dbChannelAccounts.find((a) => a.id === where.id);
            if (!current) return Promise.reject(new Error("Not found"));
            const updated: DbChannelAccount = {
              ...current,
              ...(data as Partial<DbChannelAccount>),
              id: current.id,
              business_id: current.business_id,
              channel: current.channel,
              external_account_id: current.external_account_id,
              status: typeof data.status === "string" ? data.status : current.status,
              created_at: current.created_at,
              updated_at: new Date(),
            };
            const index = dbChannelAccounts.findIndex((a) => a.id === where.id);
            dbChannelAccounts[index] = updated;
            return Promise.resolve(updated);
          },
        ),
      },
      subscription: {
        findFirst: jest.fn(({ where }: { where: { business_id: string; status: string } }) => {
          const found = dbSubscriptions.find(
            (s) => s.business_id === where.business_id && s.status === where.status,
          );
          return Promise.resolve(found ?? null);
        }),
      },
      featureFlag: {
        findFirst: jest.fn(
          ({
            where,
          }: {
            where: {
              feature?: string;
              business_id?: string;
              OR?: { business_id: string | null }[];
            };
          }) => {
            const found = dbFeatureFlags.find((f) => {
              if (where.feature && f.feature !== where.feature) return false;
              if (where.OR) {
                return where.OR.some((cond) => cond.business_id === f.business_id);
              }
              if (where.business_id !== undefined) {
                return f.business_id === where.business_id;
              }
              return true;
            });
            return Promise.resolve(found ?? null);
          },
        ),
      },
      _store: {
        dbChannelAccounts,
        dbSubscriptions,
        dbFeatureFlags,
      },
    };

    metaOAuthService = new MetaOAuthService();
    channelsService = new ChannelsService(metaOAuthService, mockPrisma as unknown as PrismaClient);
    controller = new ChannelsController(channelsService);
  });

  describe("1. Token Encryption & Decryption (AES-256-GCM)", () => {
    it("Encrypts and decrypts access token with AES-256-GCM integrity", () => {
      const plainToken = "EAABwzLixnjYBAK749281...valid_fb_page_token";
      const encrypted = metaOAuthService.encryptToken(plainToken);

      expect(encrypted).toBeDefined();
      expect(encrypted).toMatch(/^enc:gcm:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/);
      expect(encrypted).not.toContain(plainToken);

      const decrypted = metaOAuthService.decryptToken(encrypted);
      expect(decrypted).toBe(plainToken);
    });

    it("Throws validation error on tampered encrypted token", () => {
      const plainToken = "test_token_123";
      const encrypted = metaOAuthService.encryptToken(plainToken);
      const tampered = `${encrypted.substring(0, encrypted.length - 4)}0000`;

      expect(() => metaOAuthService.decryptToken(tampered)).toThrow();
    });
  });

  describe("2. Connect Channel via OAuth & Direct Connect", () => {
    it("Connect Channel: Meta OAuth exchange saves encrypted channel account.", async () => {
      // 1. Generate OAuth URL
      const oauthRes = await controller.getOAuthUrl(
        mockBusinessId,
        { headers: {} } as unknown as Parameters<typeof controller.getOAuthUrl>[1],
        "http://localhost:3000/integrations/callback",
      );

      expect(oauthRes.authorizationUrl).toContain("https://www.facebook.com/v23.0/dialog/oauth");
      expect(oauthRes.authorizationUrl).toContain("client_id=test_meta_app_id");
      expect(oauthRes.authorizationUrl).toContain("instagram_manage_messages");
      expect(oauthRes.state).toBeDefined();

      // 2. Handle OAuth callback with code
      const callbackResult = (await controller.handleCallback(
        {
          code: "test_auth_code_xyz",
          state: oauthRes.state,
          channel: "instagram",
          externalAccountId: "ig_account_998877",
          displayName: "My Instagram Store",
          pageId: "fb_page_1234",
          igUserId: "ig_user_5678",
        },
        { headers: {} } as unknown as Parameters<typeof controller.handleCallback>[1],
      )) as ChannelAccountSummary;

      expect(callbackResult).toBeDefined();
      expect(callbackResult.channel).toBe("instagram");
      expect(callbackResult.externalAccountId).toBe("ig_account_998877");
      expect(callbackResult.maskedExternalAccountId).toBe("***8877");
      expect(callbackResult.status).toBe("active");
      expect(callbackResult.displayName).toBe("My Instagram Store");
      expect(
        (callbackResult as unknown as Record<string, unknown>).credentials_ref,
      ).toBeUndefined(); // Never exposed in summary

      // Verify the record in DB has encrypted token
      const rawDbRecord = mockPrisma._store.dbChannelAccounts[0];
      expect(rawDbRecord).toBeDefined();
      expect(rawDbRecord?.credentials_ref).toMatch(/^enc:gcm:/);
      expect(rawDbRecord?.credentials_ref).not.toContain("test_auth_code_xyz");

      // Verify we can decrypt the stored token
      const decrypted = metaOAuthService.decryptToken(rawDbRecord?.credentials_ref ?? "");
      expect(decrypted).toContain("mock_meta_access_token_test_auth_code_xyz");

      // 3. List channels
      const channelsList = await controller.listChannels(mockBusinessId);
      expect(channelsList).toHaveLength(1);
      expect(channelsList[0]?.id).toBe(callbackResult.id);
      expect(channelsList[0]?.maskedExternalAccountId).toBe("***8877");
      expect(
        (channelsList[0] as unknown as Record<string, unknown>).credentials_ref,
      ).toBeUndefined();
    });

    it("Prevents duplicate active connections with 409 conflict", async () => {
      await controller.createChannelAccount(
        mockBusinessId,
        { headers: {} } as unknown as Parameters<typeof controller.createChannelAccount>[1],
        {
          channel: "messenger",
          externalAccountId: "page_12345",
          token: "token_page_12345",
          displayName: "Facebook Messenger Page",
        },
      );

      await expect(
        controller.createChannelAccount(
          mockBusinessId,
          { headers: {} } as unknown as Parameters<typeof controller.createChannelAccount>[1],
          {
            channel: "messenger",
            externalAccountId: "page_12345",
            token: "new_token_page_12345",
            displayName: "Facebook Messenger Page",
          },
        ),
      ).rejects.toThrow(ConflictException);
    });

    it("Allows reconnecting an existing disconnected channel without creating a new slot", async () => {
      // Create channel
      const chan = await controller.createChannelAccount(
        mockBusinessId,
        { headers: {} } as unknown as Parameters<typeof controller.createChannelAccount>[1],
        {
          channel: "messenger",
          externalAccountId: "page_reconnect_123",
          token: "token_123",
        },
      );

      // Disconnect channel
      const disconnected = await controller.disconnectChannel(mockBusinessId, chan.id);
      expect(disconnected.status).toBe("disconnected");

      // Reconnect channel with same channel + externalAccountId
      const reconnected = await controller.createChannelAccount(
        mockBusinessId,
        { headers: {} } as unknown as Parameters<typeof controller.createChannelAccount>[1],
        {
          channel: "messenger",
          externalAccountId: "page_reconnect_123",
          token: "rotated_new_token_456",
          displayName: "Reconnected Page",
        },
      );

      expect(reconnected.id).toBe(chan.id);
      expect(reconnected.status).toBe("active");
      expect(reconnected.displayName).toBe("Reconnected Page");
      expect(mockPrisma._store.dbChannelAccounts).toHaveLength(1);
    });
  });

  describe("3. Quota Enforcement (403)", () => {
    it("Quota Enforcement (403): Attempting to connect channels beyond plan quota returns 403 quota_exceeded.", async () => {
      // Default starter limit is 1 channel
      // 1. Connect first channel (quota: 1 / 1 -> succeeds)
      await controller.createChannelAccount(
        mockBusinessId,
        { headers: {} } as unknown as Parameters<typeof controller.createChannelAccount>[1],
        {
          channel: "instagram",
          externalAccountId: "ig_channel_1",
          token: "token_ig_1",
        },
      );

      // 2. Attempt connecting second channel (quota: 1 / 1 -> should fail with 403 quota_exceeded)
      try {
        await controller.createChannelAccount(
          mockBusinessId,
          { headers: {} } as unknown as Parameters<typeof controller.createChannelAccount>[1],
          {
            channel: "messenger",
            externalAccountId: "fb_page_channel_2",
            token: "token_fb_2",
          },
        );
        throw new Error("Expected quota_exceeded ForbiddenException");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const response = (err as ForbiddenException).getResponse() as {
          error: { code: string; details: { metric: string; limit: number; current: number } };
        };
        expect(response.error.code).toBe("quota_exceeded");
        expect(response.error.details.metric).toBe("channel_accounts");
        expect(response.error.details.limit).toBe(1);
        expect(response.error.details.current).toBe(1);
      }
    });

    it("Honors custom subscription plan limits (Growth: 5 channels)", async () => {
      // Set subscription with 5 channels limit
      mockPrisma._store.dbSubscriptions.push({
        id: "sub-1",
        business_id: mockBusinessId,
        status: "active",
        plan: {
          id: "plan-growth",
          name: "Growth",
          limits: {
            channel_accounts: 5,
            seats: 5,
          },
        },
      });

      // Connect 5 channels
      for (let i = 1; i <= 5; i++) {
        await controller.createChannelAccount(
          mockBusinessId,
          { headers: {} } as unknown as Parameters<typeof controller.createChannelAccount>[1],
          {
            channel: "instagram",
            externalAccountId: `ig_account_${i.toString()}`,
            token: `token_${i.toString()}`,
          },
        );
      }

      const list = await controller.listChannels(mockBusinessId);
      expect(list).toHaveLength(5);

      // 6th channel connection should be rejected with 403 quota_exceeded
      await expect(
        controller.createChannelAccount(
          mockBusinessId,
          { headers: {} } as unknown as Parameters<typeof controller.createChannelAccount>[1],
          {
            channel: "messenger",
            externalAccountId: "fb_channel_6",
            token: "token_6",
          },
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("4. WhatsApp Feature Flag Gate", () => {
    it("WhatsApp Gate: WhatsApp connection is blocked if feature flag is disabled.", async () => {
      // Flag is disabled by default
      try {
        await controller.createChannelAccount(
          mockBusinessId,
          { headers: {} } as unknown as Parameters<typeof controller.createChannelAccount>[1],
          {
            channel: "whatsapp",
            externalAccountId: "waba_phone_123456",
            token: "waba_token_xyz",
          },
        );
        throw new Error("Expected feature_disabled ForbiddenException");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const response = (err as ForbiddenException).getResponse() as {
          error: { code: string };
        };
        expect(response.error.code).toBe("feature_disabled");
      }
    });

    it("Allows WhatsApp connection when whatsapp_enabled is true", async () => {
      // Enable whatsapp flag for this workspace
      mockPrisma._store.dbFeatureFlags.push({
        business_id: mockBusinessId,
        feature: "whatsapp_enabled",
        enabled: true,
      });

      const connected = await controller.createChannelAccount(
        mockBusinessId,
        { headers: {} } as unknown as Parameters<typeof controller.createChannelAccount>[1],
        {
          channel: "whatsapp",
          externalAccountId: "waba_phone_enabled_123",
          token: "waba_token_valid",
          displayName: "WhatsApp Business Line",
        },
      );

      expect(connected.channel).toBe("whatsapp");
      expect(connected.status).toBe("active");
      expect(connected.displayName).toBe("WhatsApp Business Line");
    });
  });

  describe("5. Disconnect and Error Handling (T-INT-07)", () => {
    it("Disconnecting non-existent channel throws 404 not_found", async () => {
      await expect(controller.disconnectChannel(mockBusinessId, "non-existent-id")).rejects.toThrow(
        NotFoundException,
      );
      await expect(
        controller.postDisconnectChannel(mockBusinessId, "non-existent-id"),
      ).rejects.toThrow(NotFoundException);
    });

    it("Disconnect: Invalidate stored credentials on disconnect.", async () => {
      // 1. Create active channel account
      const chan = await controller.createChannelAccount(
        mockBusinessId,
        { headers: {} } as unknown as Parameters<typeof controller.createChannelAccount>[1],
        {
          channel: "instagram",
          externalAccountId: "ig_disconnect_test",
          token: "token_to_be_invalidated",
          expiresIn: 3600,
        },
      );

      const dbBefore = mockPrisma._store.dbChannelAccounts.find((a) => a.id === chan.id);
      expect(dbBefore?.credentials_ref).toBeDefined();
      expect(dbBefore?.token_expires_at).toBeDefined();
      expect(dbBefore?.status).toBe("active");

      // 2. Disconnect channel via POST /integrations/channels/:id/disconnect
      const res = await controller.postDisconnectChannel(mockBusinessId, chan.id);
      expect(res.status).toBe("disconnected");
      expect(res.disconnectedAt).toBeDefined();

      // 3. Verify in database that credentials and token expiry were invalidated
      const dbAfter = mockPrisma._store.dbChannelAccounts.find((a) => a.id === chan.id);
      expect(dbAfter?.status).toBe("disconnected");
      expect(dbAfter?.credentials_ref).toBeNull();
      expect(dbAfter?.token_expires_at).toBeNull();
      expect(dbAfter?.disconnected_at).toBeDefined();
    });

    it("DELETE /api/v1/integrations/channel-accounts/:id also invalidates credentials", async () => {
      const chan = await controller.createChannelAccount(
        mockBusinessId,
        { headers: {} } as unknown as Parameters<typeof controller.createChannelAccount>[1],
        {
          channel: "messenger",
          externalAccountId: "page_delete_test",
          token: "token_page_del",
        },
      );

      const res = await controller.disconnectChannel(mockBusinessId, chan.id);
      expect(res.status).toBe("disconnected");

      const dbRecord = mockPrisma._store.dbChannelAccounts.find((a) => a.id === chan.id);
      expect(dbRecord?.status).toBe("disconnected");
      expect(dbRecord?.credentials_ref).toBeNull();
    });
  });

  describe("6. Channel Account Health Checks (T-INT-07)", () => {
    it("Health Status: Reports token status accurately for ACTIVE, DEGRADED, and DISCONNECTED channels.", async () => {
      // 1. Healthy active channel (non-expired token)
      const activeChan = await controller.createChannelAccount(
        mockBusinessId,
        { headers: {} } as unknown as Parameters<typeof controller.createChannelAccount>[1],
        {
          channel: "instagram",
          externalAccountId: "ig_healthy_123",
          displayName: "Healthy IG Account",
          token: "valid_token_123",
          expiresIn: 30 * 86400, // 30 days in future
        },
      );

      // 2. Add an expired channel account directly to store
      const expiredDbRecord: DbChannelAccount = {
        id: "chan-expired-001",
        business_id: mockBusinessId,
        channel: "messenger",
        external_account_id: "page_expired_456",
        display_name: "Expired FB Page",
        status: "active",
        credentials_ref: metaOAuthService.encryptToken("expired_token_val"),
        token_expires_at: new Date(Date.now() - 3600 * 1000), // 1 hour ago
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockPrisma._store.dbChannelAccounts.push(expiredDbRecord);

      // 3. Add a disconnected channel account directly to store
      const disconnectedDbRecord: DbChannelAccount = {
        id: "chan-disconnected-002",
        business_id: mockBusinessId,
        channel: "whatsapp",
        external_account_id: "waba_disc_789",
        display_name: "Disconnected WhatsApp",
        status: "disconnected",
        credentials_ref: undefined,
        disconnected_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockPrisma._store.dbChannelAccounts.push(disconnectedDbRecord);

      // 4. Query GET /integrations/channels/health
      const healthList = await controller.getChannelsHealth(mockBusinessId);

      expect(healthList).toHaveLength(3);

      // Active & healthy
      const healthyHealth = healthList.find((h) => h.id === activeChan.id);
      expect(healthyHealth).toBeDefined();
      expect(healthyHealth?.healthStatus).toBe("ACTIVE");
      expect(healthyHealth?.tokenStatus).toBe("valid");
      expect(healthyHealth?.isTokenExpired).toBe(false);
      expect(healthyHealth?.isExpiringSoon).toBe(false);
      expect(healthyHealth?.lastTokenCheckAt).toBeDefined();

      // Expired -> DEGRADED
      const expiredHealth = healthList.find((h) => h.id === "chan-expired-001");
      expect(expiredHealth).toBeDefined();
      expect(expiredHealth?.healthStatus).toBe("DEGRADED");
      expect(expiredHealth?.tokenStatus).toBe("expired");
      expect(expiredHealth?.isTokenExpired).toBe(true);
      expect(expiredHealth?.lastError).toContain("expired");

      // Disconnected -> DISCONNECTED
      const disconnectedHealth = healthList.find((h) => h.id === "chan-disconnected-002");
      expect(disconnectedHealth).toBeDefined();
      expect(disconnectedHealth?.healthStatus).toBe("DISCONNECTED");
      expect(disconnectedHealth?.tokenStatus).toBe("revoked");

      // 5. Query single channel health
      const singleHealth = await controller.getChannelHealth(mockBusinessId, activeChan.id);
      expect(singleHealth.id).toBe(activeChan.id);
      expect(singleHealth.healthStatus).toBe("ACTIVE");
    });

    it("Reports DEGRADED status when channel has error or corrupted token", async () => {
      const corruptedDbRecord: DbChannelAccount = {
        id: "chan-corrupt-001",
        business_id: mockBusinessId,
        channel: "instagram",
        external_account_id: "ig_corrupt_123",
        status: "error",
        credentials_ref: "invalid_encrypted_data",
        last_error: "OAuth token revoked by user",
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockPrisma._store.dbChannelAccounts.push(corruptedDbRecord);

      const health = await controller.getChannelHealth(mockBusinessId, "chan-corrupt-001");
      expect(health.healthStatus).toBe("DEGRADED");
      expect(health.lastError).toBeDefined();
    });

    it("Single channel health check throws 404 for non-existent channel", async () => {
      await expect(
        controller.getChannelHealth(mockBusinessId, "non-existent-channel-id"),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
