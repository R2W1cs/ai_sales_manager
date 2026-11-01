import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";

import type { AcceptInvitationDto, LoginRequest, RegisterRequest, SessionDto } from "@app/shared";

import type { HttpReply, HttpRequest } from "../../platform/core/http";
import { AuthThrottlerGuard } from "../guards/auth-throttler.guard";
import { AuthService } from "./auth.service";
import {
  extractBearerToken,
  extractRefreshToken,
  getClearCookieOptions,
  getRefreshCookieOptions,
  isSecureCookie,
  parseCookies,
  REFRESH_COOKIE_NAME,
} from "./refresh";

export { isSecureCookie };

@Controller("api/v1/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * 13 §4 POST /api/v1/auth/register
   * Public. Body: email, password (min 10), name.
   * Duplicate email -> 409 conflict.
   */
  @Post("register")
  @UseGuards(AuthThrottlerGuard)
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() body: RegisterRequest,
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: HttpReply,
  ): Promise<SessionDto> {
    const { session, refreshToken } = await this.authService.register(body, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.setCookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions(req));

    return session;
  }

  /**
   * 13 §4 POST /api/v1/auth/login
   * Public. Body: email, password. Sets refresh cookie.
   * 401 on bad credentials (same copy as unknown email).
   */
  @Post("login")
  @UseGuards(AuthThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginRequest,
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: HttpReply,
  ): Promise<SessionDto> {
    const { session, refreshToken } = await this.authService.login(body, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.setCookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions(req));

    return session;
  }

  /**
   * 13 §4 POST /api/v1/auth/refresh
   * Cookie. Rotates refresh; returns new access token.
   * On failure or token reuse, clears cookie and returns 401.
   */
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: HttpReply,
  ): Promise<SessionDto> {
    const rawRefreshToken = extractRefreshToken(req);

    try {
      const { session, refreshToken } = await this.authService.refresh(rawRefreshToken, {
        ip: req.ip,
        userAgent: req.headers["user-agent"],
      });

      res.setCookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions(req));

      return session;
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE_NAME, getClearCookieOptions(req));
      throw err;
    }
  }

  /**
   * 13 §4 POST /api/v1/auth/logout
   * Token or cookie. Revokes this refresh family; clears cookie; 204.
   */
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: HttpRequest, @Res({ passthrough: true }) res: HttpReply): Promise<void> {
    const rawRefreshToken = extractRefreshToken(req);
    const rawAccessToken = extractBearerToken(req.headers.authorization);
    const cookies = parseCookies(req.headers.cookie);
    const sessionToken =
      cookies["better-auth.session_token"] ??
      cookies["__Secure-better-auth.session_token"] ??
      cookies.auth_session;

    await this.authService.logout(rawRefreshToken, rawAccessToken, sessionToken, req.headers);

    const clearOpts = getClearCookieOptions(req);
    res.clearCookie(REFRESH_COOKIE_NAME, clearOpts);
    res.clearCookie("better-auth.session_token", clearOpts);
    res.clearCookie("__Secure-better-auth.session_token", clearOpts);
    res.clearCookie("better-auth.session_data", clearOpts);
    res.clearCookie("__Secure-better-auth.session_data", clearOpts);
    res.clearCookie("better-auth.csrf_token", clearOpts);
    res.clearCookie("__Secure-better-auth.csrf_token", clearOpts);
    res.clearCookie("auth_session", clearOpts);
  }

  /**
   * 13 §4 GET /api/v1/auth/me
   * Token or session cookie. Returns user profile and memberships.
   */
  @Get("me")
  @HttpCode(HttpStatus.OK)
  async me(@Req() req: HttpRequest): Promise<SessionDto> {
    const rawAccessToken = extractBearerToken(req.headers.authorization);
    const cookies = parseCookies(req.headers.cookie);
    const sessionCookie: string | undefined =
      cookies["better-auth.session_token"] ??
      cookies["__Secure-better-auth.session_token"] ??
      cookies.auth_session;
    if (sessionCookie || req.headers.cookie) {
      return this.authService.me(rawAccessToken, sessionCookie, req.headers);
    }
    return this.authService.me(rawAccessToken);
  }

  /**
   * 13 §4 POST /api/v1/auth/invitations/accept
   * Public. Body: { token, name?, password? }.
   * 404 on expired/not-found token, 409 on already-accepted.
   * Sets refresh cookie on success and returns session DTO.
   */
  @Post("invitations/accept")
  @UseGuards(AuthThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(
    @Body() body: AcceptInvitationDto,
    @Req() req: HttpRequest,
    @Res({ passthrough: true }) res: HttpReply,
  ): Promise<SessionDto> {
    const { session, refreshToken } = await this.authService.acceptInvitation(body, {
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    res.setCookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions(req));

    return session;
  }
}
