"use client";

import { createContext, useContext } from "react";

import type { MembershipDto, MemberRole } from "@app/shared";

export interface TenantContextValue {
  currentBusinessId: string | null;
  currentRole: MemberRole | null;
  currentMembership: MembershipDto | null;
  memberships: MembershipDto[];
  businessName: string;
  switchBusiness: (businessId: string) => void;
  isLoading: boolean;
}

export const TenantContext = createContext<TenantContextValue | null>(null);

export function useTenant(): TenantContextValue {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
}

export function formatRoleLabel(role: MemberRole | null): string {
  switch (role) {
    case "owner":
      return "Propriétaire";
    case "admin":
      return "Administrateur";
    case "employee":
      return "Agent";
    default:
      return "";
  }
}

export function formatBusinessFallback(businessId: string | null): string {
  if (!businessId) return "Mon Entreprise";
  return `Entreprise ${businessId.slice(0, 8)}`;
}
