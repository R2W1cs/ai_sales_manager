"use client";

import { createContext, useContext } from "react";

import type {
  AcceptInvitationDto,
  LoginRequest,
  MembershipDto,
  RegisterRequest,
  SessionDto,
  UserDto,
} from "@app/shared";

export interface AcceptInviteOptions {
  skipAuth?: boolean;
}

export interface AuthContextValue {
  user: UserDto | null;
  memberships: MembershipDto[];
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<SessionDto>;
  register: (data: RegisterRequest) => Promise<SessionDto>;
  acceptInvite: (data: AcceptInvitationDto, options?: AcceptInviteOptions) => Promise<SessionDto>;
  logout: () => Promise<void>;
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
