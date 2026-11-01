import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  Logger,
} from "@nestjs/common";

import { env } from "@app/shared/server";

import type { HttpReply, HttpRequest } from "../../platform/core/http";
import { extractBearerToken, verifyAccessToken } from "../../platform/security/jwt";
import { RequirePermission } from "../../platform/security/permissions";
import { PermissionsGuard } from "../../platform/security/permissions.guard";
import { CurrentBusinessId, TenantGuard } from "../../platform/security/tenant.guard";
import type { MetaPageAsset } from "../meta/meta-oauth.service";
import {
  ChannelsService,
  type ChannelAccountHealthSummary,
  type ChannelAccountSummary,
  type ConnectChannelDto,
} from "./channels.service";

export interface ConnectChannelRequestBody {
  channel: "instagram" | "messenger" | "whatsapp";
  externalAccountId: string;
  token?: string;
  displayName?: string;
  pageId?: string;
  igUserId?: string;
  wabaId?: string;
  phoneNumberId?: string;
  expiresIn?: number;
  authorizedMetaUserId?: string;
}

export interface MetaCallbackRequestBody {
  code: string;
  state?: string;
  businessId?: string;
  channel?: "instagram" | "messenger" | "whatsapp";
  externalAccountId?: string;
  displayName?: string;
  pageId?: string;
  igUserId?: string;
  token?: string;
  redirectUri?: string;
}

@Controller()
export class ChannelsController {
  private readonly logger = new Logger(ChannelsController.name);

  constructor(private readonly channelsService: ChannelsService) {}

  /**
   * Helper extracting authenticated user ID from JWT bearer token.
   */
  private extractUserId(req: HttpRequest): string | undefined {
    const rawToken = extractBearerToken(req.headers.authorization);
    if (!rawToken) return undefined;
    try {
      const claims = verifyAccessToken(rawToken, env.BETTER_AUTH_SECRET);
      return claims.sub;
    } catch {
      return undefined;
    }
  }

  /**
   * 13 §10.1 GET /api/v1/integrations or GET /integrations/channels
   * Returns list of connected channel accounts for the business.
   */
  @Get(["integrations/channels", "api/v1/integrations/channels", "api/v1/integrations"])
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("integrations.manage", "inbox.read")
  async listChannels(@CurrentBusinessId() businessId: string): Promise<ChannelAccountSummary[]> {
    return this.channelsService.listChannels(businessId);
  }

  /**
   * 13 §10.1 GET /api/v1/integrations/meta/assets
   * Returns available Meta Pages / IG assets for the authenticated merchant.
   */
  @Get(["integrations/meta/assets", "api/v1/integrations/meta/assets"])
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("integrations.manage")
  async getMetaAssets(
    @CurrentBusinessId() businessId: string,
    @Req() req: HttpRequest,
  ): Promise<MetaPageAsset[]> {
    const userId = this.extractUserId(req);
    return this.channelsService.getMetaAssets(businessId, userId);
  }

  /**
   * 13 §10.1 GET /integrations/meta/oauth-url or POST /api/v1/integrations/meta/connect
   * Generates a Meta OAuth authorization URL with CSRF state token.
   */
  @Get(["integrations/meta/oauth-url", "api/v1/integrations/meta/oauth-url"])
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("integrations.manage")
  async getOAuthUrl(
    @CurrentBusinessId() businessId: string,
    @Req() req: HttpRequest,
    @Query("redirectUri") redirectUri?: string,
    @Query("state") state?: string,
    @Query("channel") channel?: "instagram" | "messenger" | "all",
  ): Promise<{ authorizationUrl: string; state: string }> {
    const userId = this.extractUserId(req);
    return this.channelsService.getOAuthUrl(businessId, userId, {
      redirectUri,
      state,
      channel,
    });
  }

  /**
   * 13 §10.1 POST /api/v1/integrations/meta/connect
   */
  @Post(["api/v1/integrations/meta/connect", "integrations/meta/connect"])
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("integrations.manage")
  async connectMeta(
    @CurrentBusinessId() businessId: string,
    @Req() req: HttpRequest,
    @Body() body?: {
      redirectUri?: string;
      state?: string;
      channel?: "instagram" | "messenger" | "all";
      returnUrl?: string;
    },
  ): Promise<{ authorizationUrl: string; state: string }> {
    const userId = this.extractUserId(req);
    return this.channelsService.getOAuthUrl(businessId, userId, {
      redirectUri: body?.redirectUri,
      state: body?.state,
      channel: body?.channel,
      returnUrl: body?.returnUrl,
    });
  }

  /**
   * 13 §10.1 POST /integrations/meta/callback or POST /api/v1/integrations/meta/callback
   * Exchanges code, encrypts token with AES-256-GCM, and saves channel_accounts row.
   */
  @Post(["integrations/meta/callback", "api/v1/integrations/meta/callback"])
  @HttpCode(HttpStatus.OK)
  async handleCallback(
    @Body() body: MetaCallbackRequestBody,
    @Req() req: HttpRequest,
  ): Promise<ChannelAccountSummary | { ok: boolean }> {
    if (!body.code) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "Authorization code is required in callback body",
        },
      });
    }

    const userId = this.extractUserId(req);
    const res = await this.channelsService.handleOAuthCallback({
      ...body,
      userId: body.businessId ? userId : undefined,
    });

    if (res.channelAccount) {
      return res.channelAccount;
    }

    return { ok: true };
  }

  /**
   * 13 §10.1 GET /api/v1/integrations/meta/callback (Public browser OAuth redirect)
   * Exchanges code, stores ephemeral token in Redis, and redirects browser to PUBLIC_APP_URL.
   */
  @Get([
    "api/v1/integrations/meta/callback",
    "integrations/meta/callback",
    "api/v1/integrations/callback",
    "integrations/callback",
  ])
  async handleBrowserCallback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Res() res: HttpReply,
  ): Promise<void> {
    const publicAppUrl = env.PUBLIC_APP_URL || "http://localhost:3000";

    if (!code || !state) {
      await res.redirect(`${publicAppUrl}/integrations?meta=error`, HttpStatus.FOUND);
      return;
    }

    try {
      const result = await this.channelsService.handleOAuthCallback({
        code,
        state,
      });
      const channel = result.channelAccount?.channel || "messenger";
      const targetBase = result.returnUrl || `${publicAppUrl}/integrations`;
      const separator = targetBase.includes("?") ? "&" : "?";
      await res.redirect(`${targetBase}${separator}meta=ok&channel=${channel}`, HttpStatus.FOUND);
    } catch (err: unknown) {
      this.logger.warn(`Meta browser OAuth callback error: ${String(err)}`);
      const errorObj = err as {
        response?: { error?: { message?: string } };
        message?: string;
      };
      const errorMessage =
        errorObj?.response?.error?.message ||
        errorObj?.message ||
        "Erreur lors de la connexion du canal.";
      await res.redirect(
        `${publicAppUrl}/integrations?meta=error&reason=${encodeURIComponent(errorMessage)}`,
        HttpStatus.FOUND,
      );
    }
  }

  /**
   * 13 §10.1 POST /api/v1/integrations/channel-accounts
   * Connects a channel account with encrypted token and plan quota enforcement.
   */
  @Post(["api/v1/integrations/channel-accounts", "integrations/channel-accounts"])
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("integrations.manage")
  async createChannelAccount(
    @CurrentBusinessId() businessId: string,
    @Req() req: HttpRequest,
    @Body() body: Partial<ConnectChannelRequestBody>,
  ): Promise<ChannelAccountSummary> {
    if (!body.channel || !body.externalAccountId) {
      throw new BadRequestException({
        error: {
          code: "validation_error",
          message: "channel and externalAccountId are required",
        },
      });
    }

    const userId = this.extractUserId(req);

    return this.channelsService.connectChannel(businessId, {
      ...(body as ConnectChannelDto),
      userId,
    });
  }

  /**
   * 13 §10.1 GET /integrations/channels/health
   * Performs health checks on all channels for the business.
   */
  @Get([
    "integrations/channels/health",
    "api/v1/integrations/channels/health",
    "api/v1/integrations/health",
  ])
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("integrations.manage", "inbox.read")
  async getChannelsHealth(
    @CurrentBusinessId() businessId: string,
  ): Promise<ChannelAccountHealthSummary[]> {
    return this.channelsService.checkChannelsHealth(businessId);
  }

  /**
   * GET /integrations/channels/:id/health
   * Performs health check on a single channel account.
   */
  @Get(["integrations/channels/:id/health", "api/v1/integrations/channels/:id/health"])
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("integrations.manage", "inbox.read")
  async getChannelHealth(
    @CurrentBusinessId() businessId: string,
    @Param("id") id: string,
  ): Promise<ChannelAccountHealthSummary> {
    return this.channelsService.checkChannelHealth(businessId, id);
  }

  /**
   * 13 §10.1 POST /integrations/channels/:id/disconnect or POST /api/v1/integrations/channels/:id/disconnect
   * Revokes token and marks channel status DISCONNECTED.
   */
  @Post([
    "integrations/channels/:id/disconnect",
    "api/v1/integrations/channels/:id/disconnect",
    "api/v1/integrations/channel-accounts/:id/disconnect",
  ])
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("integrations.manage")
  async postDisconnectChannel(
    @CurrentBusinessId() businessId: string,
    @Param("id") id: string,
  ): Promise<ChannelAccountSummary> {
    return this.channelsService.disconnectChannel(businessId, id);
  }

  /**
   * 13 §10.1 DELETE /api/v1/integrations/channel-accounts/:id
   * Disconnects a channel account (sets status to disconnected, revokes credentials, preserves history).
   */
  @Delete([
    "api/v1/integrations/channel-accounts/:id",
    "integrations/channel-accounts/:id",
    "api/v1/integrations/channels/:id",
    "integrations/channels/:id",
  ])
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantGuard, PermissionsGuard)
  @RequirePermission("integrations.manage")
  async disconnectChannel(
    @CurrentBusinessId() businessId: string,
    @Param("id") id: string,
  ): Promise<ChannelAccountSummary> {
    return this.channelsService.disconnectChannel(businessId, id);
  }
}
