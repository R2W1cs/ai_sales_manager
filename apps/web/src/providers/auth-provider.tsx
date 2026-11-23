"use client";

import React, { useCallback, useEffect, useState } from "react";

import { AuthContext, type AuthContextValue, type LoginResult } from "@/hooks/use-auth";
import { apiClient, ApiClientError } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { isPublicAuthRoute } from "@/lib/safe-redirect";
import type { LoginRequest, MembershipDto, SessionDto, UserDto } from "@app/shared";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: betterAuthSession, isPending: sessionPending, refetch } = authClient.useSession();

  const [user, setUser] = useState<UserDto | null>(null);
  const [memberships, setMemberships] = useState<MembershipDto[]>([]);
  const [mfaVerified, setMfaVerified] = useState<boolean>(false);
  const [mfaSetupRequired, setMfaSetupRequired] = useState<boolean>(false);
  const [mfaChallengeRequired, setMfaChallengeRequired] = useState<boolean>(false);
  const [bootstrappedKey, setBootstrappedKey] = useState<string | null>(null);

  const sessionKey =
    betterAuthSession?.user && betterAuthSession?.session
      ? `${betterAuthSession.user.id}:${betterAuthSession.session.id}`
      : null;

  const applySession = useCallback((session: SessionDto | null) => {
    if (session) {
      setUser(session.user);
      setMemberships(session.memberships ?? []);
      setMfaVerified(Boolean(session.mfaVerified));
      setMfaSetupRequired(Boolean(session.mfaSetupRequired));
      setMfaChallengeRequired(Boolean(session.mfaChallengeRequired));
    } else {
      setUser(null);
      setMemberships([]);
      setMfaVerified(false);
      setMfaSetupRequired(false);
      setMfaChallengeRequired(false);
    }
  }, []);

  const refreshSession = useCallback(async (): Promise<SessionDto | null> => {
    try {
      await refetch();
      const session = await apiClient.refreshSession();
      applySession(session);
      return session;
    } catch {
      applySession(null);
      return null;
    }
  }, [applySession, refetch]);

  async function login(credentials: LoginRequest): Promise<LoginResult> {
    const result = await authClient.signIn.email({
      email: credentials.email.trim(),
      password: credentials.password,
    });

    if (result.error) {
      throw new ApiClientError(
        result.error.status ?? 401,
        result.error.code ?? "unauthorized",
        result.error.message ?? "Invalid email or password",
      );
    }

    const data = result.data as { twoFactorRedirect?: boolean } | null;
    if (data?.twoFactorRedirect) {
      return { twoFactorRedirect: true, session: null };
    }

    const session = await refreshSession();
    return { twoFactorRedirect: false, session };
  }

  async function acceptInvite(invitationId: string): Promise<{ businessId: string; role: string }> {
    const accepted = await apiClient.post<{ businessId: string; role: string }>(
      `/api/v1/invitations/${encodeURIComponent(invitationId)}/accept`,
    );
    await refreshSession();
    return accepted;
  }

  async function logout(redirectTo = "/login"): Promise<void> {
    try {
      await authClient.signOut();
    } catch {
      // Clear local state even if remote signOut fails
    }
    applySession(null);
    if (typeof window !== "undefined") {
      window.location.href = redirectTo;
    }
  }

  // Bootstrap full user + workspace memberships whenever Better Auth session changes
  useEffect(() => {
    if (sessionPending || !sessionKey) {
      return undefined;
    }

    let mounted = true;

    apiClient
      .refreshSession()
      .then((session) => {
        if (mounted) {
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
          setBootstrappedKey(sessionKey);
        }
      });

    return () => {
      mounted = false;
    };
  }, [sessionPending, sessionKey, applySession]);

  useEffect(() => {
    const unsubscribeRefreshed = apiClient.onTokenRefreshed((session) => {
      applySession(session);
    });

    const unsubscribeExpired = apiClient.onSessionExpired(() => {
      applySession(null);
      if (typeof window !== "undefined" && !isPublicAuthRoute(window.location.pathname)) {
        window.location.href = "/login";
      }
    });

    const unsubscribeMfa = apiClient.onMfaRequired((kind) => {
      if (typeof window !== "undefined" && !isPublicAuthRoute(window.location.pathname)) {
        window.location.href = kind === "mfa_setup_required" ? "/2fa/setup" : "/2fa";
      }
    });

    return () => {
      unsubscribeRefreshed();
      unsubscribeExpired();
      unsubscribeMfa();
    };
  }, [applySession]);

  const hasBetterAuthUser = Boolean(betterAuthSession?.user);
  const exposedUser = hasBetterAuthUser ? user : null;
  const exposedMemberships = hasBetterAuthUser ? memberships : [];
  const exposedMfaVerified = hasBetterAuthUser ? mfaVerified : false;
  const exposedMfaSetupRequired = hasBetterAuthUser ? mfaSetupRequired : false;
  const exposedMfaChallengeRequired = hasBetterAuthUser ? mfaChallengeRequired : false;
  const isBootstrapping = Boolean(sessionKey && bootstrappedKey !== sessionKey);

  const value: AuthContextValue = {
    user: exposedUser,
    memberships: exposedMemberships,
    mfaVerified: exposedMfaVerified,
    mfaSetupRequired: exposedMfaSetupRequired,
    mfaChallengeRequired: exposedMfaChallengeRequired,
    isAuthenticated: Boolean(exposedUser),
    isLoading: sessionPending || isBootstrapping,
    login,
    acceptInvite,
    logout,
    refreshSession,
    setSession: applySession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
