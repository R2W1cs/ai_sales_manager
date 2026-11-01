import crypto from "node:crypto";

import { BadRequestException, Injectable, Logger, Optional } from "@nestjs/common";
import Redis from "ioredis";

import { env } from "@app/shared/server";

export interface GenerateOAuthUrlOptions {
  businessId: string;
  userId?: string;
  redirectUri?: string;
  returnUrl?: string;
  state?: string;
  whatsappEnabled?: boolean;
  channel?: "instagram" | "messenger" | "all";
}

export interface OAuthStatePayload {
  businessId: string;
  userId?: string;
  channel?: "instagram" | "messenger" | "all";
  redirectUri?: string;
  returnUrl?: string;
  createdAt: number;
}

export interface CodeExchangeResult {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
  metaUserId?: string;
}

export interface MetaPageAsset {
  id: string;
  name: string;
  instagramBusinessAccountId?: string;
  instagramUsername?: string;
}

@Injectable()
export class MetaOAuthService {
  private readonly logger = new Logger(MetaOAuthService.name);
  private readonly stateStore = new Map<string, OAuthStatePayload>();
  private readonly userTokenStore = new Map<string, { token: string; createdAt: number }>();
  private redis: Redis | null = null;

  constructor(@Optional() redisClient?: Redis) {
    if (redisClient) {
      this.redis = redisClient;
    } else {
      try {
        const redisUrl = env.REDIS_URL;
        if (redisUrl) {
          this.redis = new Redis(redisUrl, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
          });
        } else if (env.REDIS_HOST && env.REDIS_PORT) {
          this.redis = new Redis({
            host: env.REDIS_HOST,
            port: env.REDIS_PORT,
            password: env.REDIS_PASSWORD,
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
          });
        }
      } catch (err) {
        this.logger.warn("Redis client initialization failed; using in-memory state store", err);
      }
    }
  }

  /**
   * Derives a 32-byte key for AES-256-GCM from ENCRYPTION_KEY or BETTER_AUTH_SECRET.
   */
  private getEncryptionKey(): Buffer {
    const rawKey = env.ENCRYPTION_KEY ?? env.BETTER_AUTH_SECRET;
    return crypto.createHash("sha256").update(rawKey).digest();
  }

  /**
   * Encrypts a plaintext access token using AES-256-GCM.
   * Output format: enc:gcm:<iv_hex>:<authTag_hex>:<ciphertext_hex>
   */
  encryptToken(plainToken: string): string {
    if (!plainToken) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Cannot encrypt empty token",
        },
      });
    }

    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);

    let encrypted = cipher.update(plainToken, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    return `enc:gcm:${iv.toString("hex")}:${authTag}:${encrypted}`;
  }

  /**
   * Decrypts an AES-256-GCM encrypted token.
   */
  decryptToken(encryptedToken: string): string {
    if (!encryptedToken) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Cannot decrypt empty token",
        },
      });
    }

    let payload = encryptedToken;
    if (payload.startsWith("enc:gcm:")) {
      payload = payload.substring("enc:gcm:".length);
    }

    const parts = payload.split(":");
    if (parts.length !== 3) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Invalid encrypted token format",
        },
      });
    }

    const [ivHex, authTagHex, cipherHex] = parts;
    if (!ivHex || !authTagHex || !cipherHex) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Invalid encrypted token structure",
        },
      });
    }

    const key = this.getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }

  /**
   * Saves OAuth state token with 10-minute TTL.
   */
  async saveOAuthState(
    state: string,
    data: {
      businessId: string;
      userId?: string;
      channel?: "instagram" | "messenger" | "all";
      redirectUri?: string;
      returnUrl?: string;
    },
  ): Promise<void> {
    const payload: OAuthStatePayload = {
      businessId: data.businessId,
      userId: data.userId,
      channel: data.channel,
      redirectUri: data.redirectUri,
      returnUrl: data.returnUrl,
      createdAt: Date.now(),
    };

    if (this.redis) {
      try {
        await this.redis.set(`oauth:meta:${state}`, JSON.stringify(payload), "EX", 600);
        return;
      } catch (err) {
        this.logger.warn("Failed saving OAuth state to Redis; falling back to memory", err);
      }
    }

    this.stateStore.set(state, payload);
  }

  /**
   * Consumes and validates OAuth state token (single-use).
   */
  async consumeOAuthState(state: string): Promise<OAuthStatePayload | null> {
    if (this.redis) {
      try {
        const raw = await this.redis.get(`oauth:meta:${state}`);
        if (raw) {
          await this.redis.del(`oauth:meta:${state}`);
          return JSON.parse(raw) as OAuthStatePayload;
        }
      } catch (err) {
        this.logger.warn("Failed retrieving OAuth state from Redis; falling back to memory", err);
      }
    }

    const payload = this.stateStore.get(state);
    if (!payload) {
      return null;
    }

    this.stateStore.delete(state);

    if (Date.now() - payload.createdAt > 10 * 60 * 1000) {
      return null;
    }

    return payload;
  }

  /**
   * Stashes ephemeral user token in Redis with 10-minute TTL.
   * 16 §5.1: oauth:meta:usertoken:{userId}:{businessId}
   */
  async saveUserToken(userId: string, businessId: string, token: string): Promise<void> {
    const key = `oauth:meta:usertoken:${userId}:${businessId}`;
    if (this.redis) {
      try {
        await this.redis.set(key, token, "EX", 600);
        return;
      } catch (err) {
        this.logger.warn(
          "Failed storing ephemeral user token to Redis; falling back to memory",
          err,
        );
      }
    }

    this.userTokenStore.set(key, { token, createdAt: Date.now() });
  }

  /**
   * Retrieves ephemeral user token from Redis.
   */
  async getUserToken(userId: string, businessId: string): Promise<string | null> {
    const key = `oauth:meta:usertoken:${userId}:${businessId}`;
    if (this.redis) {
      try {
        const token = await this.redis.get(key);
        if (token) return token;
      } catch (err) {
        this.logger.warn(
          "Failed retrieving ephemeral user token from Redis; falling back to memory",
          err,
        );
      }
    }

    const entry = this.userTokenStore.get(key);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > 10 * 60 * 1000) {
      this.userTokenStore.delete(key);
      return null;
    }

    return entry.token;
  }

  /**
   * Generates a signed Meta OAuth authorization URL with required MVP scopes.
   * 16 §5.2 MVP scopes: pages_show_list, pages_messaging, pages_manage_metadata, instagram_basic, instagram_manage_messages
   */
  async getAuthorizationUrl(options: GenerateOAuthUrlOptions): Promise<{
    authorizationUrl: string;
    state: string;
  }> {
    const state = options.state || crypto.randomUUID();
    await this.saveOAuthState(state, {
      businessId: options.businessId,
      userId: options.userId,
      channel: options.channel,
      redirectUri: options.redirectUri,
      returnUrl: options.returnUrl,
    });

    const appId = env.META_APP_ID ?? "mock_meta_app_id";
    const graphVersion = env.META_GRAPH_VERSION;
    const redirectUri =
      options.redirectUri ??
      env.META_OAUTH_REDIRECT_URI ??
      `${env.PUBLIC_APP_URL}/integrations/callback`;

    const scopes: string[] = [];

    if (options.channel === "messenger") {
      scopes.push("pages_show_list", "pages_messaging", "pages_manage_metadata");
    } else if (options.channel === "instagram") {
      scopes.push(
        "pages_show_list",
        "pages_manage_metadata",
        "instagram_basic",
        "instagram_manage_messages",
      );
    } else {
      scopes.push(
        "pages_show_list",
        "pages_messaging",
        "pages_manage_metadata",
        "instagram_basic",
        "instagram_manage_messages",
      );
    }

    if (options.whatsappEnabled) {
      scopes.push("whatsapp_business_management", "whatsapp_business_messaging");
    }

    const searchParams = new URLSearchParams({
      client_id: appId,
      redirect_uri: redirectUri,
      state,
      scope: scopes.join(","),
      response_type: "code",
    });

    const authorizationUrl = `https://www.facebook.com/${graphVersion}/dialog/oauth?${searchParams.toString()}`;

    return {
      authorizationUrl,
      state,
    };
  }

  /**
   * Exchanges authorization code for an access token.
   */
  async exchangeCode(params: { code: string; redirectUri?: string }): Promise<CodeExchangeResult> {
    const { code, redirectUri } = params;

    // Deterministic mock exchange for testing/offline environments
    if (!env.META_APP_SECRET || env.NODE_ENV === "test") {
      return {
        accessToken: `mock_meta_access_token_${code}_${Date.now().toString()}`,
        tokenType: "bearer",
        expiresIn: 5184000, // 60 days
        metaUserId: "mock_meta_user_id_123",
      };
    }

    const appId = env.META_APP_ID;
    const appSecret = env.META_APP_SECRET;
    const graphVersion = env.META_GRAPH_VERSION;
    const resolvedRedirectUri =
      redirectUri ?? env.META_OAUTH_REDIRECT_URI ?? `${env.PUBLIC_APP_URL}/integrations/callback`;

    const tokenUrl = `https://graph.facebook.com/${graphVersion}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(resolvedRedirectUri)}&code=${encodeURIComponent(code)}`;

    try {
      const response = await fetch(tokenUrl);
      if (!response.ok) {
        const errText = await response.text();
        throw new BadRequestException({
          error: {
            code: "validation_error",
            message: `Meta OAuth exchange failed: ${errText}`,
          },
        });
      }

      const data = (await response.json()) as {
        access_token: string;
        token_type: string;
        expires_in?: number;
      };

      return {
        accessToken: data.access_token,
        tokenType: data.token_type || "bearer",
        expiresIn: data.expires_in,
        metaUserId: `meta_user_${Date.now().toString()}`,
      };
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message:
            err instanceof Error ? err.message : "Failed to exchange Meta authorization code",
        },
      });
    }
  }

  /**
   * Discovers Facebook Pages and connected Instagram Business Accounts for the user.
   */
  async getPagesAndInstagramAccounts(userToken: string): Promise<
    Array<{
      pageId: string;
      pageName: string;
      pageAccessToken?: string;
      instagramBusinessAccount?: {
        id: string;
        username?: string;
        name?: string;
      };
    }>
  > {
    if (!env.META_APP_SECRET || env.NODE_ENV === "test") {
      return [
        {
          pageId: "page_mock_123",
          pageName: "My Official Business Page",
          instagramBusinessAccount: {
            id: "ig_mock_456",
            username: "official_store_ig",
            name: "My Official IG",
          },
        },
      ];
    }

    try {
      const url = `https://graph.facebook.com/${env.META_GRAPH_VERSION}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name}&access_token=${encodeURIComponent(userToken)}`;
      const res = await fetch(url);
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as {
        data?: Array<{
          id: string;
          name: string;
          access_token?: string;
          instagram_business_account?: {
            id: string;
            username?: string;
            name?: string;
          };
        }>;
      };
      return (data.data || []).map((item) => ({
        pageId: item.id,
        pageName: item.name,
        pageAccessToken: item.access_token,
        instagramBusinessAccount: item.instagram_business_account,
      }));
    } catch {
      return [];
    }
  }
}
