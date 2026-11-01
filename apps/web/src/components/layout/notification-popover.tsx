"use client";

import {
  Bell,
  CheckCheck,
  Flame,
  HelpCircle,
  MessageSquareWarning,
  ShoppingBag,
  UserCheck,
} from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  type NotificationItemDto,
  type PaginatedNotificationsResponse,
  REALTIME_EVENTS,
} from "@app/shared";

import { formatBadgeCount } from "./nav-items";
import { useTenant } from "./tenant-context";

export interface NotificationPopoverProps {
  className?: string;
}

type NotificationType = NotificationItemDto["type"];

interface NotificationWithTime extends NotificationItemDto {
  timeLabel: string;
}

function formatNotificationTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Tunis",
    });
  } catch {
    return "";
  }
}

function getNotificationBadge(
  type: NotificationType | string,
  tNotifications: (key: string) => string,
) {
  switch (type) {
    case "HOT_LEAD":
      return {
        label: tNotifications("hotLead"),
        icon: <Flame className="size-3 text-warning" />,
        badgeClass: "bg-warning/10 text-warning border-warning/20",
      };
    case "ORDER_REQUEST":
      return {
        label: tNotifications("orderRequest"),
        icon: <ShoppingBag className="size-3 text-success" />,
        badgeClass: "bg-success/10 text-success border-success/20",
      };
    case "HANDOFF":
      return {
        label: tNotifications("handoff"),
        icon: <UserCheck className="size-3 text-primary" />,
        badgeClass: "bg-primary/10 text-primary border-primary/20",
      };
    case "ESCALATION":
      return {
        label: tNotifications("escalation"),
        icon: <MessageSquareWarning className="size-3 text-destructive" />,
        badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
      };
    default:
      return {
        label: tNotifications("alert"),
        icon: <HelpCircle className="size-3 text-muted-foreground" />,
        badgeClass: "bg-muted text-muted-foreground border-border",
      };
  }
}

export function NotificationPopover({ className }: NotificationPopoverProps): React.ReactElement {
  const tNotifications = useTranslations("notifications");
  const tCommon = useTranslations("common");
  const { currentBusinessId } = useTenant();
  const router = useRouter();

  const [notifications, setNotifications] = useState<NotificationWithTime[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState<boolean>(false);

  // 1. Fetch initial unread notifications
  useEffect(() => {
    if (!currentBusinessId) {
      return;
    }

    let mounted = true;

    apiClient
      .get<PaginatedNotificationsResponse>("/api/v1/notifications?unread=true", {
        headers: { "x-business-id": currentBusinessId },
        skipRefresh: true,
      })
      .then((res) => {
        if (mounted && res) {
          const itemsWithTime: NotificationWithTime[] = (res.items ?? []).map((item) => ({
            ...item,
            timeLabel: formatNotificationTime(item.createdAt),
          }));
          setNotifications(itemsWithTime);
          setUnreadCount(res.unreadCount ?? 0);
          setNextCursor(res.nextCursor ?? null);
        }
      })
      .catch(() => {
        // Ignored
      });

    return () => {
      mounted = false;
    };
  }, [currentBusinessId]);

  // 2. Realtime listener: Client event notification.new increments and prepends
  useEffect(() => {
    if (!currentBusinessId || typeof window === "undefined") {
      return undefined;
    }

    const socketUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
    const socket = io(socketUrl, {
      path: "/socket.io",
      auth: { businessId: currentBusinessId },
      autoConnect: true,
    });

    const handleNewNotification = (payload: { notification?: NotificationItemDto }) => {
      if (payload?.notification) {
        const item = payload.notification;
        const itemWithTime: NotificationWithTime = {
          ...item,
          timeLabel: formatNotificationTime(item.createdAt),
        };
        setNotifications((prev) => [itemWithTime, ...prev]);
        setUnreadCount((prev) => prev + 1);
      }
    };

    socket.on(REALTIME_EVENTS.NOTIFICATION_NEW, handleNewNotification);

    return () => {
      socket.off(REALTIME_EVENTS.NOTIFICATION_NEW, handleNewNotification);
      socket.close();
    };
  }, [currentBusinessId]);

  async function handleLoadMore() {
    if (!nextCursor || isBusy || !currentBusinessId) return;

    setIsBusy(true);
    try {
      const res = await apiClient.get<PaginatedNotificationsResponse>(
        `/api/v1/notifications?unread=true&cursor=${encodeURIComponent(nextCursor)}`,
        {
          headers: { "x-business-id": currentBusinessId },
          skipRefresh: true,
        },
      );
      if (res) {
        const newItems: NotificationWithTime[] = (res.items ?? []).map((item) => ({
          ...item,
          timeLabel: formatNotificationTime(item.createdAt),
        }));
        setNotifications((prev) => [...prev, ...newItems]);
        setNextCursor(res.nextCursor ?? null);
      }
      setIsBusy(false);
    } catch {
      setIsBusy(false);
    }
  }

  async function handleMarkAllRead() {
    if (isBusy || !currentBusinessId || unreadCount === 0) return;

    setIsBusy(true);
    try {
      await apiClient.post("/api/v1/notifications/read-all", undefined, {
        headers: { "x-business-id": currentBusinessId },
        skipRefresh: true,
      });
      setNotifications([]);
      setUnreadCount(0);
      setNextCursor(null);
      setIsBusy(false);
    } catch {
      setIsBusy(false);
    }
  }

  async function handleItemClick(item: NotificationWithTime) {
    if (isBusy || !currentBusinessId) return;

    setIsBusy(true);
    try {
      await apiClient.patch(`/api/v1/notifications/${item.id}/read`, undefined, {
        headers: { "x-business-id": currentBusinessId },
        skipRefresh: true,
      });
      setNotifications((prev) => prev.filter((n) => n.id !== item.id));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      setIsBusy(false);
    } catch {
      setIsBusy(false);
    }

    if (item.entityType === "conversation" && item.entityId) {
      router.push(`/inbox?id=${item.entityId}` as Route);
    } else {
      router.push("/inbox" as Route);
    }
  }

  const activeNotifications = currentBusinessId ? notifications : [];
  const activeUnreadCount = currentBusinessId ? unreadCount : 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "relative h-9 w-9 rounded-md p-0 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
              className,
            )}
            aria-label={`${tNotifications("title")} (${tNotifications("unreadCount", { count: activeUnreadCount })})`}
          />
        }
      >
        <Bell className="size-4" />
        {activeUnreadCount > 0 && (
          <span
            data-slot="unread-badge"
            className="absolute -inset-e-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground ring-2 ring-background"
          >
            {formatBadgeCount(activeUnreadCount)}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80 overflow-hidden border border-border bg-popover p-0 text-popover-foreground shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border bg-popover px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">{tNotifications("title")}</span>
            {activeUnreadCount > 0 && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {activeUnreadCount}
              </span>
            )}
          </div>
          {activeUnreadCount > 0 && (
            <button
              type="button"
              disabled={isBusy}
              onClick={handleMarkAllRead}
              className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              <CheckCheck className="size-3" />
              <span>{tCommon("markAllRead")}</span>
            </button>
          )}
        </div>

        <div className="max-h-85 divide-y divide-border overflow-y-auto">
          {activeNotifications.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {tNotifications("emptyTitle")}
            </div>
          ) : (
            activeNotifications.map((item) => {
              const badge = getNotificationBadge(item.type, (k) =>
                tNotifications(k as Parameters<typeof tNotifications>[0]),
              );
              return (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="flex cursor-pointer flex-col items-start gap-1 p-3 text-start transition-colors focus:bg-muted"
                >
                  <div className="flex w-full items-center justify-between">
                    <span
                      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium ${badge.badgeClass}`}
                    >
                      {badge.icon}
                      <span>{badge.label}</span>
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {item.timeLabel}
                    </span>
                  </div>
                  <span className="line-clamp-1 text-xs font-medium text-foreground">
                    {item.title}
                  </span>
                  <span className="line-clamp-2 text-[11px] text-muted-foreground">
                    {item.message}
                  </span>
                </DropdownMenuItem>
              );
            })
          )}
        </div>

        {nextCursor && (
          <div className="border-t border-border bg-popover/90 p-2 text-center">
            <button
              type="button"
              disabled={isBusy}
              onClick={handleLoadMore}
              className="text-xs font-medium text-primary transition-colors hover:underline disabled:opacity-50"
            >
              {isBusy ? tCommon("loading") : tCommon("loadMore")}
            </button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
