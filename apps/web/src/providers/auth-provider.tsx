"use client";

import React, { useEffect, useState } from "react";

import { AuthContext, type AuthContextValue } from "@/hooks/use-auth";
import { apiClient, setAccessToken } from "@/lib/api-client";
import type {
  AcceptInvitationDto,
  LoginRequest,
  MembershipDto,
  RegisterRequest,
  SessionDto,
  UserDto,
} from "@app/shared";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [memberships, setMemberships] = useState<MembershipDto[]>([]);
  const [accessTokenState, setAccessTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  function applySession(session: SessionDto | null) {
    if (session) {
      setUser(session.user);
      setMemberships(session.memberships ?? []);
      const token = session.accessToken ?? null;
      setAccessTokenState(token);
      setAccessToken(token);
    } else {
      setUser(null);
      setMemberships([]);
      setAccessTokenState(null);
      setAccessToken(null);
    }
  }

  async function refreshSession(): Promise<SessionDto | null> {
    try {
      const session = await apiClient.refreshSession();
      applySession(session);
      return session;
    } catch {
      applySession(null);
      return null;
    }
  }

  async function login(credentials: LoginRequest): Promise<SessionDto> {
    const session = await apiClient.post<SessionDto>("/api/v1/auth/login", credentials, {
      skipAuth: true,
      skipRefresh: true,
    });
    applySession(session);
    return session;
  }

  async function register(data: RegisterRequest): Promise<SessionDto> {
    const session = await apiClient.post<SessionDto>("/api/v1/auth/register", data, {
      skipAuth: true,
      skipRefresh: true,
    });
    applySession(session);
    return session;
  }

  async function acceptInvite(
    data: AcceptInvitationDto,
    options?: { skipAuth?: boolean },
  ): Promise<SessionDto> {
    const skipAuth = options?.skipAuth ?? !user;
    const session = await apiClient.post<SessionDto>("/api/v1/auth/invitations/accept", data, {
      skipRefresh: true,
      skipAuth,
    });
    applySession(session);
    return session;
  }

  async function logout(): Promise<void> {
    try {
      await apiClient.post("/api/v1/auth/logout", undefined, {
        skipRefresh: true,
      });
    } catch {
      // Ignored: cleanup session locally even if server call fails
    }
    applySession(null);
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  // Initial silent refresh to restore in-memory session from HTTP-only cookie
  useEffect(() => {
    let mounted = true;

    apiClient
      .refreshSession()
      .then((session) => {
        if (mounted && session) {
          applySession(session);
        }
      })
      .catch(() => {
        if (mounted) {
          applySession(null);
        }
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    const unsubscribeRefreshed = apiClient.onTokenRefreshed((session) => {
      if (mounted) {
        applySession(session);
      }
    });

    const unsubscribeExpired = apiClient.onSessionExpired(() => {
      if (mounted) {
        applySession(null);
        if (typeof window !== "undefined") {
          const pathname = window.location.pathname;
          if (
            !pathname.startsWith("/login") &&
            !pathname.startsWith("/register") &&
            !pathname.startsWith("/invite") &&
            !pathname.startsWith("/embed")
          ) {
            window.location.href = "/login";
          }
        }
      }
    });

    return () => {
      mounted = false;
      unsubscribeRefreshed();
      unsubscribeExpired();
    };
  }, []);

  const value: AuthContextValue = {
    user,
    memberships,
    accessToken: accessTokenState,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    acceptInvite,
    logout,
    refreshSession,
    setSession: applySession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
