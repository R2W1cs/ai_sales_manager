"use client";

import { createContext, useContext } from "react";

import type { LoginRequest, MembershipDto, SessionDto, UserDto } from "@app/shared";

export interface LoginResult {
  twoFactorRedirect?: boolean;
  session?: SessionDto | null;
}

export interface AuthContextValue {
  user: UserDto | null;
  memberships: MembershipDto[];
  mfaVerified: boolean;
  mfaSetupRequired: boolean;
  mfaChallengeRequired: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<LoginResult>;
  acceptInvite: (invitationId: string) => Promise<{ businessId: string; role: string }>;
  logout: (redirectTo?: string) => Promise<void>;
  refreshSession: () => Promise<SessionDto | null>;
  setSession: (session: SessionDto | null) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
