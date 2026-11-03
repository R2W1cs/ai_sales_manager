"use client";

import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";

import { apiClient } from "@/lib/api-client";

interface BusinessDetail {
  id: string;
  name: string;
  industry: string;
  country: string;
  currency: string;
  language: string;
  timezone: string;
  planName: string | null;
  subscriptionStatus: string | null;
  counts: {
    products: number;
    customers: number;
    conversations: number;
    orders: number;
  };
  members: { name: string; email: string; role: string }[];
  channels: { channel: string; displayName: string | null; status: string }[];
  recentConversations: {
    id: string;
    customerName: string | null;
    source: string;
    status: string;
    preview: string | null;
    lastMessageAt: string | null;
  }[];
}

export default function OperatorBusinessPage(): React.ReactElement {
  const t = useTranslations("operator");
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<BusinessDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    let cancelled = false;
    apiClient
      .get<BusinessDetail>(`/api/v1/platform/businesses/${params.id}`)
      .then((row) => {
        if (!cancelled) setDetail(row);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : t("loadError"));
      });
    return () => {
      cancelled = true;
    };
  }, [params.id, t]);

  return (
    <div className="space-y-6">
      <Link href={"/operator" as Route} className="text-sm text-primary">
        {t("back")}
      </Link>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!detail && !error ? <p className="text-sm text-muted-foreground">{t("loading")}</p> : null}
      {detail ? (
        <>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{detail.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {detail.industry} · {detail.country} · {detail.currency} · {detail.language} ·{" "}
              {detail.timezone}
            </p>
            <p className="mt-1 text-sm">
              {detail.planName ?? t("noPlan")}
              {detail.subscriptionStatus ? ` · ${detail.subscriptionStatus}` : ""}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Mini label={t("products")} value={detail.counts.products} />
            <Mini label={t("customers")} value={detail.counts.customers} />
            <Mini label={t("statConversations")} value={detail.counts.conversations} />
            <Mini label={t("orders")} value={detail.counts.orders} />
          </div>

          <section className="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="mb-2 text-sm font-semibold">{t("members")}</h2>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {detail.members.map((member) => (
                  <li key={member.email} className="px-3 py-2 text-sm">
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {member.email} · {member.role}
                    </p>
                  </li>
                ))}
                {detail.members.length === 0 ? (
                  <li className="px-3 py-3 text-sm text-muted-foreground">{t("empty")}</li>
                ) : null}
              </ul>
            </div>
            <div>
              <h2 className="mb-2 text-sm font-semibold">{t("colChannels")}</h2>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {detail.channels.map((channel) => (
                  <li
                    key={`${channel.channel}-${channel.displayName ?? ""}`}
                    className="px-3 py-2 text-sm"
                  >
                    {channel.channel}
                    {channel.displayName ? ` · ${channel.displayName}` : ""} · {channel.status}
                  </li>
                ))}
                {detail.channels.length === 0 ? (
                  <li className="px-3 py-3 text-sm text-muted-foreground">{t("noChannels")}</li>
                ) : null}
              </ul>
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold">{t("recent")}</h2>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {detail.recentConversations.map((conversation) => (
                <li key={conversation.id} className="px-3 py-2 text-sm">
                  <p className="font-medium">
                    {conversation.customerName ?? t("visitor")} · {conversation.source} ·{" "}
                    {conversation.status}
                  </p>
                  <p className="text-xs text-muted-foreground">{conversation.preview ?? "—"}</p>
                </li>
              ))}
              {detail.recentConversations.length === 0 ? (
                <li className="px-3 py-3 text-sm text-muted-foreground">{t("empty")}</li>
              ) : null}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }): React.ReactElement {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
