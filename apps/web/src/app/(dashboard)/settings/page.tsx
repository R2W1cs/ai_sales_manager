"use client";

import {
  CreditCard,
  MessageCircle,
  Settings as SettingsIcon,
  Sparkles,
  Truck,
  Users,
} from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { redirect } from "next/navigation";
import React, { useEffect, useState } from "react";

import { useTenant } from "@/components/layout/tenant-context";
import { SettingsBillingTab } from "@/components/settings/settings-billing-tab";
import { SettingsChannelsTab } from "@/components/settings/settings-channels-tab";
import { SettingsPersonalityTab } from "@/components/settings/settings-personality-tab";
import { SettingsRulesTab } from "@/components/settings/settings-rules-tab";
import { SettingsTeamTab } from "@/components/settings/settings-team-tab";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack } from "@/components/ui/stack";
import { Wrapper } from "@/components/ui/wrapper";

export type SettingsTabKey = "personality" | "channels" | "rules" | "team" | "billing";

export default function SettingsPage(): React.ReactElement {
  const t = useTranslations("settings");
  const { currentBusinessId, currentRole, isLoading: tenantLoading } = useTenant();

  const [activeTab, setActiveTab] = useState<SettingsTabKey>("personality");
  const isInitialMount = React.useRef(true);

  const isOwner = currentRole === "owner";

  // Invariant: Employee cannot access /settings -> redirect to /inbox
  if (!tenantLoading && currentRole === "employee") {
    redirect("/inbox" as Route);
  }

  // URL hash syncing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "") as SettingsTabKey;
      const validTabs: SettingsTabKey[] = ["personality", "channels", "rules", "team", "billing"];
      if (validTabs.includes(hash)) {
        if (hash === "billing" && currentRole && currentRole !== "owner") {
          setActiveTab("personality");
          window.location.hash = "#personality";
        } else {
          setActiveTab(hash);
        }
      }
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [currentRole]);

  // Sync hash when activeTab changes (skipping initial mount so existing URL hash isn't clobbered)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (window.location.hash !== `#${activeTab}`) {
      window.location.hash = `#${activeTab}`;
    }
  }, [activeTab]);

  const handleTabSelect = (key: SettingsTabKey) => {
    setActiveTab(key);
  };

  if (tenantLoading) {
    return (
      <div className="space-y-6 p-6" data-testid="settings-page-loading">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }

  const tabs = [
    {
      key: "personality" as const,
      label: t("tabPersonality"),
      icon: Sparkles,
      testId: "tab-trigger-personality",
    },
    {
      key: "channels" as const,
      label: t("tabChannels"),
      icon: MessageCircle,
      testId: "tab-trigger-channels",
    },
    {
      key: "rules" as const,
      label: t("tabRules"),
      icon: Truck,
      testId: "tab-trigger-rules",
    },
    {
      key: "team" as const,
      label: t("tabTeam"),
      icon: Users,
      testId: "tab-trigger-team",
    },
    // Invariant: Billing tab is strictly visible to OWNER
    ...(isOwner
      ? [
          {
            key: "billing" as const,
            label: t("tabBilling"),
            icon: CreditCard,
            testId: "tab-trigger-billing",
          },
        ]
      : []),
  ];

  return (
    <div className="h-full flex-1 overflow-y-auto bg-background">
      <Container className="py-4 sm:py-6">
        <Wrapper gap="lg" data-testid="settings-page">
          {/* Header */}
          <Stack direction="column" size="xs">
            <Stack direction="row" size="sm" className="text-foreground">
              <SettingsIcon className="size-6 text-primary" />
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("title")}</h1>
            </Stack>
            <p className="text-xs text-muted-foreground sm:text-sm">{t("subtitle")}</p>
          </Stack>

          {/* Tabs Navigation */}
          <div className="border-b border-border">
            <Stack
              direction="row"
              size="xs"
              wrap={false}
              className="overflow-x-auto pb-px"
              aria-label={t("ariaTabs")}
              data-testid="settings-tabs-nav"
              asChild
            >
              <nav>
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.key;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      data-testid={tab.testId}
                      onClick={() => handleTabSelect(tab.key)}
                      className={`group flex items-center gap-2 border-b-2 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors sm:text-sm ${
                        isActive
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      <Icon
                        className={`size-4 ${isActive ? "text-primary" : "text-muted-foreground"}`}
                      />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            </Stack>
          </div>

          {/* Active Tab Panel */}
          <div className="mt-2" data-testid="settings-tab-content">
            {activeTab === "personality" && (
              <SettingsPersonalityTab businessId={currentBusinessId} />
            )}
            {activeTab === "channels" && <SettingsChannelsTab businessId={currentBusinessId} />}
            {activeTab === "rules" && <SettingsRulesTab businessId={currentBusinessId} />}
            {activeTab === "team" && <SettingsTeamTab businessId={currentBusinessId} />}
            {activeTab === "billing" && isOwner && (
              <SettingsBillingTab businessId={currentBusinessId} isOwner={isOwner} />
            )}
          </div>
        </Wrapper>
      </Container>
    </div>
  );
}
