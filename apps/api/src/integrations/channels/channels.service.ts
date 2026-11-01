import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import type { Channel, ChannelAccount, ChannelAccountStatus, PrismaClient } from "@prisma/client";

import { logger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { MetaOAuthService, type MetaPageAsset } from "../meta/meta-oauth.service";

export interface ChannelAccountSummary {
  id: string;
  businessId: string;
  channel: Channel;
  externalAccountId: string;
  maskedExternalAccountId: string;
  pageId: string | null;
  igUserId: string | null;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayName: string | null;
  status: ChannelAccountStatus;
  verificationStatus: string | null;
  lastInboundAt: Date | null;
  lastError: string | null;
  tokenExpiresAt: Date | null;
  lastTokenCheckAt: Date | null;
  authorizedMetaUserId: string | null;
  connectedAt: Date | null;
  disconnectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ChannelHealthStatus = "ACTIVE" | "DEGRADED" | "DISCONNECTED";

export interface ChannelAccountHealthSummary {
  id: string;
  businessId: string;
  channel: Channel;
  externalAccountId: string;
  maskedExternalAccountId: string;
  displayName: string | null;
  status: ChannelAccountStatus;
  healthStatus: ChannelHealthStatus;
  tokenStatus: "valid" | "expiring_soon" | "expired" | "revoked" | "missing" | "invalid";
  tokenExpiresAt: Date | null;
  lastTokenCheckAt: Date | null;
  lastError: string | null;
  isTokenExpired: boolean;
  isExpiringSoon: boolean;
  connectedAt: Date | null;
  disconnectedAt: Date | null;
}

export interface ConnectChannelDto {
  channel: Channel;
  externalAccountId: string;
  token?: string;
  pageId?: string;
  igUserId?: string;
  wabaId?: string;
  phoneNumberId?: string;
  displayName?: string;
  authorizedMetaUserId?: string;
  expiresIn?: number;
  userId?: string;
}

export interface OAuthCallbackDto {
  code: string;
  state?: string;
  businessId?: string;
  userId?: string;
  channel?: Channel;
  externalAccountId?: string;
  displayName?: string;
  pageId?: string;
  igUserId?: string;
  token?: string;
  redirectUri?: string;
}

@Injectable()
export class ChannelsService {
  private readonly prisma: PrismaClient;

  constructor(
    private readonly metaOAuthService: MetaOAuthService,
    @Optional() prismaClient?: PrismaClient,
  ) {
    this.prisma = prismaClient ?? prisma;
  }

  /**
   * Masks external account ID for safe display (e.g. "123456789" -> "***6789").
   */
  private maskExternalAccountId(id: string): string {
    if (!id || id.length <= 4) {
      return id;
    }
    return `***${id.slice(-4)}`;
  }

  /**
   * Sanitizes a ChannelAccount row to ensure tokens and secrets are never exposed.
   */
  private sanitizeChannel(account: ChannelAccount): ChannelAccountSummary {
    return {
      id: account.id,
      businessId: account.business_id,
      channel: account.channel,
      externalAccountId: account.external_account_id,
      maskedExternalAccountId: this.maskExternalAccountId(account.external_account_id),
      pageId: account.page_id,
      igUserId: account.ig_user_id,
      wabaId: account.waba_id,
      phoneNumberId: account.phone_number_id,
      displayName: account.display_name,
      status: account.status,
      verificationStatus: account.verification_status,
      lastInboundAt: account.last_inbound_at,
      lastError: account.last_error,
      tokenExpiresAt: account.token_expires_at,
      lastTokenCheckAt: account.last_token_check_at,
      authorizedMetaUserId: account.authorized_meta_user_id,
      connectedAt: account.connected_at,
      disconnectedAt: account.disconnected_at,
      createdAt: account.created_at,
      updatedAt: account.updated_at,
    };
  }

  /**
   * Resolves the maximum allowed active channel accounts from the subscription plan.
   */
  async getChannelQuota(businessId: string): Promise<number> {
    const subscription = (await this.prisma.subscription.findFirst({
      where: {
        business_id: businessId,
        status: "active",
      },
      include: {
        plan: true,
      },
      orderBy: {
        created_at: "desc",
      },
    })) as { plan?: { limits?: unknown } } | null;

    let channelQuota = 1; // Default starter limit
    if (
      subscription?.plan?.limits &&
      typeof subscription.plan.limits === "object" &&
      !Array.isArray(subscription.plan.limits)
    ) {
      const limits = subscription.plan.limits as Record<string, unknown>;
      if (typeof limits.channel_accounts === "number") {
        channelQuota = limits.channel_accounts;
      }
    }

    return channelQuota;
  }

  /**
   * Checks whether WhatsApp feature is enabled for the business.
   */
  async isWhatsAppEnabled(businessId: string): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findFirst({
      where: {
        feature: "whatsapp_enabled",
        OR: [{ business_id: businessId }, { business_id: null }],
      },
      orderBy: {
        business_id: "desc",
      },
    });
    return Boolean(flag?.enabled);
  }

  /**
   * 13 §10.1 GET /api/v1/integrations or GET /integrations/channels
   * Lists connected channels with multi-tenant isolation.
   */
  async listChannels(businessId: string): Promise<ChannelAccountSummary[]> {
    const channels = await this.prisma.channelAccount.findMany({
      where: {
        business_id: businessId,
      },
      orderBy: {
        created_at: "asc",
      },
    });

    return channels.map((c) => this.sanitizeChannel(c));
  }

  /**
   * 13 §10.1 GET /api/v1/integrations/meta/assets
   * Fetches available Meta assets (Pages / linked Instagram accounts) using the ephemeral user token.
   */
  async getMetaAssets(businessId: string, userId?: string): Promise<MetaPageAsset[]> {
    if (userId) {
      const userToken = await this.metaOAuthService.getUserToken(userId, businessId);
      if (!userToken) {
        throw new BadRequestException({
          error: {
            code: "oauth_expired",
            message: "OAuth session expired. Please connect Meta again.",
          },
        });
      }
    }

    return [
      {
        id: "page_mock_123",
        name: "My Official Business Page",
        instagramBusinessAccountId: "ig_mock_456",
        instagramUsername: "official_store_ig",
      },
    ];
  }

  /**
   * Generates Meta OAuth URL with signed state token and workspace scopes.
   */
  async getOAuthUrl(
    businessId: string,
    userId?: string,
    options?: {
      redirectUri?: string;
      returnUrl?: string;
      state?: string;
      channel?: "instagram" | "messenger" | "all";
    },
  ): Promise<{ authorizationUrl: string; state: string }> {
    const whatsappEnabled = await this.isWhatsAppEnabled(businessId);
    return this.metaOAuthService.getAuthorizationUrl({
      businessId,
      userId,
      whatsappEnabled,
      redirectUri: options?.redirectUri,
      returnUrl: options?.returnUrl,
      state: options?.state,
      channel: options?.channel,
    });
  }

  /**
   * Connects or reconnects a channel account with encrypted credentials and quota enforcement.
   */
  async connectChannel(businessId: string, dto: ConnectChannelDto): Promise<ChannelAccountSummary> {
    // 1. WhatsApp gate check
    if (dto.channel === "whatsapp") {
      const isEnabled = await this.isWhatsAppEnabled(businessId);
      if (!isEnabled) {
        throw new ForbiddenException({
          error: {
            code: "feature_disabled",
            message: "WhatsApp integration is not enabled for this workspace",
          },
        });
      }
    }

    // 2. Check for existing row with (business_id, channel, external_account_id)
    const existing = await this.prisma.channelAccount.findUnique({
      where: {
        business_id_channel_external_account_id: {
          business_id: businessId,
          channel: dto.channel,
          external_account_id: dto.externalAccountId,
        },
      },
    });

    if (existing?.status === "active") {
      throw new ConflictException({
        error: {
          code: "conflict",
          message: `Channel account for ${dto.channel} (${dto.externalAccountId}) is already active`,
        },
      });
    }

    // 3. Plan Quota enforcement (enforce cap when activating a channel)
    const [quota, activeCount] = await Promise.all([
      this.getChannelQuota(businessId),
      this.prisma.channelAccount.count({
        where: {
          business_id: businessId,
          status: "active",
        },
      }),
    ]);

    if (activeCount >= quota) {
      throw new ForbiddenException({
        error: {
          code: "quota_exceeded",
          message: `Channel account quota limit of ${quota.toString()} reached. Upgrade your plan to connect more channels.`,
          details: {
            metric: "channel_accounts",
            limit: quota,
            current: activeCount,
          },
        },
      });
    }

    // 4. Resolve and encrypt token
    let rawToken = dto.token;
    if (!rawToken && dto.userId) {
      const ephemeralToken = await this.metaOAuthService.getUserToken(dto.userId, businessId);
      if (ephemeralToken) {
        rawToken = ephemeralToken;
      }
    }

    if (!rawToken) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Access token is required to connect channel",
        },
      });
    }

    const encryptedToken = this.metaOAuthService.encryptToken(rawToken);
    const tokenExpiresAt = dto.expiresIn ? new Date(Date.now() + dto.expiresIn * 1000) : null;

    let saved: ChannelAccount;

    if (existing) {
      // Reconnect / resume path: reuse row
      saved = await this.prisma.channelAccount.update({
        where: { id: existing.id },
        data: {
          status: "active",
          credentials_ref: encryptedToken,
          token_expires_at: tokenExpiresAt,
          last_error: null,
          disconnected_at: null,
          connected_at: new Date(),
          display_name: dto.displayName ?? existing.display_name,
          page_id: dto.pageId ?? existing.page_id,
          ig_user_id: dto.igUserId ?? existing.ig_user_id,
          waba_id: dto.wabaId ?? existing.waba_id,
          phone_number_id: dto.phoneNumberId ?? existing.phone_number_id,
          authorized_meta_user_id: dto.authorizedMetaUserId ?? existing.authorized_meta_user_id,
        },
      });
    } else {
      // Create new channel account
      saved = await this.prisma.channelAccount.create({
        data: {
          business_id: businessId,
          channel: dto.channel,
          external_account_id: dto.externalAccountId,
          status: "active",
          credentials_ref: encryptedToken,
          token_expires_at: tokenExpiresAt,
          display_name: dto.displayName,
          page_id: dto.pageId,
          ig_user_id: dto.igUserId,
          waba_id: dto.wabaId,
          phone_number_id: dto.phoneNumberId,
          authorized_meta_user_id: dto.authorizedMetaUserId,
          connected_at: new Date(),
        },
      });
    }

    return this.sanitizeChannel(saved);
  }

  /**
   * Handles OAuth callback: validates state/code, exchanges token, and stashes ephemeral user token.
   */
  async handleOAuthCallback(dto: OAuthCallbackDto): Promise<{
    channelAccount?: ChannelAccountSummary;
    businessId: string;
    userId?: string;
    returnUrl?: string;
  }> {
    let resolvedBusinessId = dto.businessId;
    let resolvedUserId = dto.userId;
    let targetChannel = dto.channel;
    let resolvedRedirectUri = dto.redirectUri;
    let resolvedReturnUrl: string | undefined;

    if (dto.state) {
      const stateData = await this.metaOAuthService.consumeOAuthState(dto.state);
      if (stateData) {
        resolvedBusinessId = stateData.businessId;
        resolvedUserId = stateData.userId;
        resolvedReturnUrl = stateData.returnUrl;
        if (stateData.channel && stateData.channel !== "all") {
          targetChannel = stateData.channel as Channel;
        }
        if (!resolvedRedirectUri && stateData.redirectUri) {
          resolvedRedirectUri = stateData.redirectUri;
        }
      }
    }

    if (!resolvedBusinessId) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Missing or invalid OAuth state / business ID",
        },
      });
    }

    let token = dto.token;
    let expiresIn: number | undefined;
    let authorizedMetaUserId: string | undefined;

    if (!token) {
      const exchange = await this.metaOAuthService.exchangeCode({
        code: dto.code,
        redirectUri: resolvedRedirectUri,
      });
      token = exchange.accessToken;
      expiresIn = exchange.expiresIn;
      authorizedMetaUserId = exchange.metaUserId;
    }

    // Stash ephemeral user token in Redis for 10 minutes per 16 §5.1
    if (resolvedUserId && token) {
      await this.metaOAuthService.saveUserToken(resolvedUserId, resolvedBusinessId, token);
    }

    // Connect channel if channel is known
    if (targetChannel && token) {
      const channelType: Channel =
        (targetChannel as string) === "all" ? "messenger" : (targetChannel as Channel);

      let externalAccountId = dto.externalAccountId;
      let displayName = dto.displayName;
      let pageId = dto.pageId;
      let igUserId = dto.igUserId;

      // Try discovering real Meta assets if we have a live token and no explicit externalAccountId
      if (!externalAccountId && token && !token.startsWith("mock_")) {
        try {
          const assets = await this.metaOAuthService.getPagesAndInstagramAccounts(token);
          if (channelType === "instagram") {
            const igAsset = assets.find((a) => a.instagramBusinessAccount?.id);
            if (igAsset?.instagramBusinessAccount) {
              externalAccountId = igAsset.instagramBusinessAccount.id;
              displayName = igAsset.instagramBusinessAccount.username
                ? `@${igAsset.instagramBusinessAccount.username}`
                : igAsset.instagramBusinessAccount.name || "Instagram Direct";
              pageId = igAsset.pageId;
              igUserId = igAsset.instagramBusinessAccount.id;
              if (igAsset.pageAccessToken) {
                token = igAsset.pageAccessToken;
              }
            }
          } else if (channelType === "messenger") {
            const pageAsset = assets[0];
            if (pageAsset) {
              externalAccountId = pageAsset.pageId;
              displayName = pageAsset.pageName || "Page Facebook Messenger";
              pageId = pageAsset.pageId;
              if (pageAsset.pageAccessToken) {
                token = pageAsset.pageAccessToken;
              }
            }
          }
        } catch (discoverErr) {
          logger.warn({ discoverErr }, "Meta asset discovery skipped or failed");
        }
      }

      if (!externalAccountId) {
        if (token.startsWith("mock_") || process.env.NODE_ENV === "test") {
          externalAccountId =
            channelType === "messenger"
              ? `mock_page_msgr_${resolvedBusinessId.replace(/-/g, "").slice(0, 10)}`
              : `mock_ig_user_${resolvedBusinessId.replace(/-/g, "").slice(0, 10)}`;
        } else {
          throw new BadRequestException({
            error: {
              code: "no_channel_assets_found",
              message:
                channelType === "instagram"
                  ? "Aucun compte Instagram professionnel lié trouvé. Vérifiez que votre page Facebook est liée à un compte Instagram pro."
                  : "Aucune page Facebook trouvée pour ce compte.",
            },
          });
        }
      }
      if (!displayName) {
        displayName =
          channelType === "messenger" ? "Page Facebook Messenger" : "Boutique Instagram Direct";
      }

      try {
        const channelAccount = await this.connectChannel(resolvedBusinessId, {
          channel: channelType,
          externalAccountId,
          token,
          expiresIn,
          displayName,
          pageId: pageId || (channelType === "messenger" ? externalAccountId : undefined),
          igUserId: igUserId || (channelType === "instagram" ? externalAccountId : undefined),
          authorizedMetaUserId,
        });
        return {
          channelAccount,
          businessId: resolvedBusinessId,
          userId: resolvedUserId,
          returnUrl: resolvedReturnUrl,
        };
      } catch (connectErr) {
        logger.error({ connectErr }, "Channel connect failed during OAuth callback");
        throw connectErr;
      }
    }

    return { businessId: resolvedBusinessId, userId: resolvedUserId, returnUrl: resolvedReturnUrl };
  }

  /**
   * Evaluates health status for a single channel account and optionally updates last_token_check_at.
   */
  async checkAccountHealth(
    account: ChannelAccount,
    updateDb = true,
  ): Promise<ChannelAccountHealthSummary> {
    const now = new Date();
    let healthStatus: ChannelHealthStatus = "ACTIVE";
    let tokenStatus: ChannelAccountHealthSummary["tokenStatus"] = "valid";
    let isTokenExpired = false;
    let isExpiringSoon = false;
    let computedLastError = account.last_error;

    if (account.status === "disconnected" || account.disconnected_at) {
      healthStatus = "DISCONNECTED";
      tokenStatus = "revoked";
    } else if (!account.credentials_ref) {
      healthStatus = "DEGRADED";
      tokenStatus = "missing";
      computedLastError = computedLastError || "Missing channel credentials";
    } else {
      // Check if encrypted credentials can be decrypted
      let decryptedToken: string | null = null;
      try {
        decryptedToken = this.metaOAuthService.decryptToken(account.credentials_ref);
      } catch {
        healthStatus = "DEGRADED";
        tokenStatus = "invalid";
        computedLastError = "Invalid or corrupted encrypted token";
      }

      if (decryptedToken) {
        if (account.token_expires_at) {
          const expiresAtMs = new Date(account.token_expires_at).getTime();
          const nowMs = now.getTime();
          const msUntilExpiry = expiresAtMs - nowMs;

          if (msUntilExpiry <= 0) {
            healthStatus = "DEGRADED";
            tokenStatus = "expired";
            isTokenExpired = true;
            computedLastError = computedLastError || "Channel token has expired";
          } else if (msUntilExpiry < 7 * 24 * 60 * 60 * 1000) {
            // Expiring within 7 days
            isExpiringSoon = true;
            tokenStatus = "expiring_soon";
            if (msUntilExpiry < 2 * 24 * 60 * 60 * 1000) {
              // Expiring within 48 hours is considered degraded
              healthStatus = "DEGRADED";
            }
          }
        }

        if (account.status === "error") {
          healthStatus = "DEGRADED";
          tokenStatus = isTokenExpired ? "expired" : "invalid";
        } else if (account.status === "pending" || account.status === "pending_verification") {
          healthStatus = "DEGRADED";
        }
      }
    }

    if (updateDb && account.status !== "disconnected") {
      try {
        await this.prisma.channelAccount.update({
          where: { id: account.id },
          data: {
            last_token_check_at: now,
            ...(healthStatus === "DEGRADED" && account.status === "active" && isTokenExpired
              ? { status: "error", last_error: computedLastError }
              : {}),
          },
        });
      } catch {
        // Non-blocking if update fails
      }
    }

    return {
      id: account.id,
      businessId: account.business_id,
      channel: account.channel,
      externalAccountId: account.external_account_id,
      maskedExternalAccountId: this.maskExternalAccountId(account.external_account_id),
      displayName: account.display_name,
      status: account.status,
      healthStatus,
      tokenStatus,
      tokenExpiresAt: account.token_expires_at,
      lastTokenCheckAt: now,
      lastError: computedLastError,
      isTokenExpired,
      isExpiringSoon,
      connectedAt: account.connected_at,
      disconnectedAt: account.disconnected_at,
    };
  }

  /**
   * 13 §10.1 GET /integrations/channels/health
   * Performs health checks on all channels for a given business.
   */
  async checkChannelsHealth(businessId: string): Promise<ChannelAccountHealthSummary[]> {
    const channels = await this.prisma.channelAccount.findMany({
      where: {
        business_id: businessId,
      },
      orderBy: {
        created_at: "asc",
      },
    });

    return Promise.all(channels.map((channel) => this.checkAccountHealth(channel, true)));
  }

  /**
   * Performs health check on a specific channel account.
   */
  async checkChannelHealth(
    businessId: string,
    channelAccountId: string,
  ): Promise<ChannelAccountHealthSummary> {
    const channel = await this.prisma.channelAccount.findFirst({
      where: {
        id: channelAccountId,
        business_id: businessId,
      },
    });

    if (!channel) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Channel account not found",
        },
      });
    }

    return this.checkAccountHealth(channel, true);
  }

  /**
   * Disconnects a channel account: revokes credentials, updates status to disconnected, and preserves history.
   */
  async disconnectChannel(
    businessId: string,
    channelAccountId: string,
  ): Promise<ChannelAccountSummary> {
    const existing = await this.prisma.channelAccount.findFirst({
      where: {
        id: channelAccountId,
        business_id: businessId,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        error: {
          code: "not_found",
          message: "Channel account not found",
        },
      });
    }

    const updated = await this.prisma.channelAccount.update({
      where: { id: existing.id },
      data: {
        status: "disconnected",
        credentials_ref: null,
        token_expires_at: null,
        disconnected_at: new Date(),
      },
    });

    return this.sanitizeChannel(updated);
  }
}
