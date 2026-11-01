"use client";

import { Check, ChevronsUpDown, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import React, { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import {
  formatBusinessFallback,
  formatRoleLabel,
  TenantContext,
  type TenantContextValue,
  useTenant,
} from "./tenant-context";

export interface TenantProviderProps {
  children: React.ReactNode;
  initialBusinessId?: string | null;
}

export function TenantProvider({
  children,
  initialBusinessId,
}: TenantProviderProps): React.ReactElement {
  const tRoles = useTranslations("roles");
  const { memberships, isLoading: authLoading } = useAuth();
  const [, startTransition] = useTransition();
  const router = useRouter();

  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(() => {
    if (initialBusinessId) return initialBusinessId;
    if (typeof window !== "undefined") {
      return localStorage.getItem("active_business_id");
    }
    return null;
  });

  const currentBusinessId =
    (selectedBusinessId && memberships.some((m) => m.businessId === selectedBusinessId)
      ? selectedBusinessId
      : memberships[0]?.businessId) ?? null;

  const [businessName, setBusinessName] = useState<string>(() => tRoles("defaultBusinessName"));

  // Fetch business profile details when currentBusinessId changes
  useEffect(() => {
    if (!currentBusinessId) return;

    let mounted = true;
    apiClient
      .get<{ name: string }>(`/api/v1/businesses/${currentBusinessId}`, {
        headers: { "x-business-id": currentBusinessId },
        skipRefresh: true,
      })
      .then((res) => {
        if (mounted && res?.name) {
          setBusinessName(res.name);
        }
      })
      .catch(() => {
        if (mounted) {
          setBusinessName(formatBusinessFallback(currentBusinessId));
        }
      });

    return () => {
      mounted = false;
    };
  }, [currentBusinessId]);

  const currentMembership =
    memberships.find((m) => m.businessId === currentBusinessId) ?? memberships[0] ?? null;
  const currentRole = currentMembership?.role ?? null;

  function switchBusiness(newBusinessId: string) {
    if (newBusinessId === currentBusinessId) return;
    const target = memberships.find((m) => m.businessId === newBusinessId);
    if (!target) return;

    setSelectedBusinessId(newBusinessId);
    if (typeof window !== "undefined") {
      localStorage.setItem("active_business_id", newBusinessId);
      document.cookie = `x-business-id=${newBusinessId}; path=/; max-age=31536000; SameSite=Lax`;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  const value: TenantContextValue = {
    currentBusinessId,
    currentRole,
    currentMembership,
    memberships,
    businessName,
    switchBusiness,
    isLoading: authLoading,
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export interface TenantSwitcherProps {
  className?: string;
}

export function TenantSwitcher({ className }: TenantSwitcherProps): React.ReactElement | null {
  const tRoles = useTranslations("roles");
  const { currentBusinessId, currentRole, businessName, memberships, switchBusiness } = useTenant();

  if (!currentBusinessId && memberships.length === 0) {
    return null;
  }

  const currentRoleLabel =
    currentRole && tRoles.has(currentRole) ? tRoles(currentRole) : formatRoleLabel(currentRole);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-9 max-w-55 gap-2 rounded-md border border-border bg-card/60 px-2.5 text-xs text-foreground transition-colors hover:border-ring/50 hover:bg-muted",
              className,
            )}
            aria-label={tRoles("switchBusiness")}
          />
        }
      >
        <Store className="size-4 shrink-0 text-primary" />
        <div className="flex min-w-0 flex-col items-start text-start leading-tight">
          <span className="max-w-30 truncate font-medium text-foreground">{businessName}</span>
          <span className="text-[10px] text-muted-foreground capitalize">{currentRoleLabel}</span>
        </div>
        <ChevronsUpDown className="ms-auto size-3.5 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-56 border border-border bg-popover text-popover-foreground shadow-xl"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[11px] tracking-wider text-muted-foreground uppercase">
            {tRoles("workspaces")}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border" />
          {memberships.map((m) => {
            const isSelected = m.businessId === currentBusinessId;
            const roleLabel =
              m.role && tRoles.has(m.role) ? tRoles(m.role) : formatRoleLabel(m.role);
            return (
              <DropdownMenuItem
                key={m.businessId}
                onClick={() => switchBusiness(m.businessId)}
                className="flex cursor-pointer items-center justify-between px-2.5 py-2 text-xs focus:bg-muted focus:text-foreground"
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    {m.businessId === currentBusinessId
                      ? businessName
                      : formatBusinessFallback(m.businessId)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{roleLabel}</span>
                </div>
                {isSelected && <Check className="size-4 text-primary" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
