import { BarChart3, Bot, Columns3, Globe, Inbox, Package, Settings } from "lucide-react";
import type React from "react";

import type { MemberRole } from "@app/shared";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  requiredRole?: MemberRole[];
  hasBadge?: boolean;
}

export const ALL_NAV_ITEMS: NavItem[] = [
  {
    key: "inbox",
    label: "Boîte de réception",
    href: "/inbox",
    icon: Inbox,
    hasBadge: true,
  },
  {
    key: "playground",
    label: "AI Playground",
    href: "/playground",
    icon: Bot,
    requiredRole: ["owner", "admin"],
  },
  {
    key: "website",
    label: "Website chat",
    href: "/website",
    icon: Globe,
    requiredRole: ["owner", "admin"],
  },
  {
    key: "pipeline",
    label: "Pipeline de vente",
    href: "/pipeline",
    icon: Columns3,
  },
  {
    key: "products",
    label: "Produits",
    href: "/products",
    icon: Package,
  },
  {
    key: "analytics",
    label: "Analyses",
    href: "/analytics",
    icon: BarChart3,
  },
  {
    key: "settings",
    label: "Paramètres",
    href: "/settings",
    icon: Settings,
    // RBAC: Settings strictly hidden for Employee role
    requiredRole: ["owner", "admin"],
  },
];

export function getFilteredNavItems(role: MemberRole | null): NavItem[] {
  return ALL_NAV_ITEMS.filter((item) => {
    if (!item.requiredRole) return true;
    if (!role) return false;
    return item.requiredRole.includes(role);
  });
}

export function formatBadgeCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}
