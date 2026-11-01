"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Mail,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import React, { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient, ApiClientError } from "@/lib/api-client";

export interface MemberItem {
  id?: string;
  userId: string;
  email: string;
  name?: string | null;
  role: "owner" | "admin" | "employee";
  createdAt?: string;
  lastActiveAt?: string | null;
}

export interface InvitationItem {
  id: string;
  email: string;
  role: "admin" | "employee";
  expiresAt: string;
  createdAt: string;
}

export interface SettingsTeamTabProps {
  businessId: string | null;
}

export function SettingsTeamTab({ businessId }: SettingsTeamTabProps): React.ReactElement {
  const t = useTranslations("settings");
  const locale = useLocale();
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [invitations, setInvitations] = useState<InvitationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Invite modal state
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "employee">("employee");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Delete confirmation modal state
  const [memberToDelete, setMemberToDelete] = useState<string | null>(null);

  // Action states
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const memberDateFormatter = React.useMemo(() => {
    return new Intl.DateTimeFormat(
      locale === "ar" ? "ar-TN" : locale === "en" ? "en-US" : "fr-TN",
      {
        year: "numeric",
        month: "short",
        day: "numeric",
      },
    );
  }, [locale]);

  const fetchTeamData = useCallback(() => {
    if (!businessId) {
      setIsLoading(false);
      return;
    }
    const headers: Record<string, string> = { "x-business-id": businessId };

    Promise.all([
      apiClient
        .get<MemberItem[]>(`/api/v1/businesses/${businessId}/members`, { headers })
        .catch(() => []),
      apiClient
        .get<InvitationItem[]>(`/api/v1/businesses/${businessId}/invitations`, { headers })
        .catch(() => []),
    ])
      .then(([membersData, invitesData]) => {
        setMembers(membersData || []);
        setInvitations(invitesData || []);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : t("errorLoadMembers");
        setError(msg);
        setIsLoading(false);
      });
  }, [businessId, t]);

  useEffect(() => {
    let isMounted = true;
    if (!businessId) return;

    const headers: Record<string, string> = { "x-business-id": businessId };

    Promise.all([
      apiClient
        .get<MemberItem[]>(`/api/v1/businesses/${businessId}/members`, { headers })
        .catch(() => []),
      apiClient
        .get<InvitationItem[]>(`/api/v1/businesses/${businessId}/invitations`, { headers })
        .catch(() => []),
    ])
      .then(([membersData, invitesData]) => {
        if (!isMounted) return;
        setMembers(membersData || []);
        setInvitations(invitesData || []);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : t("errorLoadMembers");
        setError(msg);
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [businessId, t]);

  const handleSendInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (isInviting || !businessId || !inviteEmail.trim()) return;

    setIsInviting(true);
    setInviteError(null);
    const headers: Record<string, string> = {
      "x-business-id": businessId,
      "idempotency-key": `invite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    apiClient
      .post(
        `/api/v1/businesses/${businessId}/invitations`,
        {
          email: inviteEmail.trim(),
          role: inviteRole,
        },
        { headers },
      )
      .then(() => {
        setSuccess(t("inviteSuccess"));
        setInviteEmail("");
        setIsInviteOpen(false);
        setIsInviting(false);
        fetchTeamData();
      })
      .catch((err: unknown) => {
        if (err instanceof ApiClientError && err.code === "quota_exceeded") {
          setInviteError(t("quotaExceededSeats"));
        } else {
          const msg = err instanceof Error ? err.message : t("errorInviteMember");
          setInviteError(msg);
        }
        setIsInviting(false);
      });
  };

  const handleRevokeInvite = (inviteId: string) => {
    if (!businessId || revokingId) return;
    setRevokingId(inviteId);
    setError(null);
    const headers: Record<string, string> = { "x-business-id": businessId };

    apiClient
      .delete(`/api/v1/businesses/${businessId}/invitations/${inviteId}`, {
        headers,
      })
      .then(() => {
        setSuccess(t("inviteRevoked"));
        setRevokingId(null);
        fetchTeamData();
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : t("errorRevokeInvite");
        setError(msg);
        setRevokingId(null);
      });
  };

  const handleRoleChange = (userId: string, newRole: "admin" | "employee") => {
    if (!businessId || updatingUserId) return;
    setUpdatingUserId(userId);
    setError(null);
    const headers: Record<string, string> = { "x-business-id": businessId };

    apiClient
      .patch(
        `/api/v1/businesses/${businessId}/members/${userId}/role`,
        { role: newRole },
        { headers },
      )
      .then(() => {
        setSuccess(t("roleUpdated"));
        setUpdatingUserId(null);
        fetchTeamData();
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : t("errorRoleUpdate");
        setError(msg);
        setUpdatingUserId(null);
      });
  };

  const handleRemoveMember = (userId: string) => {
    if (!businessId || updatingUserId) return;
    setUpdatingUserId(userId);
    setError(null);
    const headers: Record<string, string> = { "x-business-id": businessId };

    apiClient
      .delete(`/api/v1/businesses/${businessId}/members/${userId}`, { headers })
      .then(() => {
        setSuccess(t("memberRemoved"));
        setUpdatingUserId(null);
        fetchTeamData();
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : t("errorRemoveMember");
        setError(msg);
        setUpdatingUserId(null);
      });
  };

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="settings-team-loading">
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="settings-team-tab">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Active Members Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <div className="flex items-center gap-2 text-primary">
              <Users className="size-5" />
              <CardTitle className="text-base">{t("teamTitle")}</CardTitle>
            </div>
            <CardDescription className="text-xs">{t("teamDesc")}</CardDescription>
          </div>
          <Button
            type="button"
            data-testid="invite-member-button"
            onClick={() => setIsInviteOpen(true)}
          >
            <UserPlus className="me-2 size-4" />
            <span>{t("inviteMember")}</span>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto" data-testid="members-table">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th
                    scope="col"
                    aria-label={t("memberColName")}
                    className="pb-3 text-start font-medium"
                  >
                    {t("memberColName")}
                  </th>
                  <th
                    scope="col"
                    aria-label={t("memberColRole")}
                    className="pb-3 text-start font-medium"
                  >
                    {t("memberColRole")}
                  </th>
                  <th
                    scope="col"
                    aria-label={t("lastActive")}
                    className="pb-3 text-start font-medium"
                  >
                    {t("lastActive")}
                  </th>
                  <th
                    scope="col"
                    aria-label={t("memberColActions")}
                    className="pb-3 text-end font-medium"
                  >
                    {t("memberColActions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {members.map((member) => {
                  const isOwner = member.role === "owner";
                  const isUpdating = updatingUserId === member.userId;

                  return (
                    <tr key={member.userId || member.email} className="hover:bg-muted/20">
                      <td className="py-3" aria-label={member.name || member.email}>
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">
                            {member.name || member.email}
                          </span>
                          <span className="text-[11px] text-muted-foreground">{member.email}</span>
                        </div>
                      </td>
                      <td className="py-3">
                        {isOwner ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                            <Shield className="size-3" />
                            <span>{t("roleOwner")}</span>
                          </span>
                        ) : (
                          <div>
                            <label
                              htmlFor={`member-role-select-${member.userId}`}
                              className="sr-only"
                            >
                              {t("memberColRole")}
                            </label>
                            <select
                              id={`member-role-select-${member.userId}`}
                              data-testid="member-role-select"
                              aria-label={t("memberColRole")}
                              value={member.role}
                              disabled={isUpdating}
                              onChange={(e) =>
                                handleRoleChange(
                                  member.userId,
                                  e.target.value as "admin" | "employee",
                                )
                              }
                              className="h-7 rounded-md border border-input bg-background px-2 text-xs shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
                            >
                              <option value="admin">{t("roleAdmin")}</option>
                              <option value="employee">{t("roleEmployee")}</option>
                            </select>
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {member.lastActiveAt
                          ? memberDateFormatter.format(new Date(member.lastActiveAt))
                          : t("neverActive")}
                      </td>
                      <td className="py-3 text-end">
                        {!isOwner && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-testid="remove-member-button"
                            aria-label={t("removeMember")}
                            disabled={isUpdating}
                            onClick={() => setMemberToDelete(member.userId)}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            {isUpdating ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-3.5" />
                            )}
                            <span className="ms-1">{t("removeMember")}</span>
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pending Invitations Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("pendingInvitesTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <p
              className="py-4 text-center text-xs text-muted-foreground"
              data-testid="no-invites-text"
            >
              {t("noPendingInvites")}
            </p>
          ) : (
            <div className="space-y-2" data-testid="pending-invites-list">
              {invitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex items-center gap-3">
                    <Mail className="size-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-semibold text-foreground">{inv.email}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {inv.role === "admin" ? t("roleAdmin") : t("roleEmployee")}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="revoke-invite-button"
                    disabled={revokingId === inv.id}
                    onClick={() => handleRevokeInvite(inv.id)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    {revokingId === inv.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <X className="size-3.5" />
                    )}
                    <span className="ms-1">{t("revokeInvite")}</span>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Modal Dialog */}
      <DialogPrimitive.Root open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs transition-opacity" />
          <DialogPrimitive.Popup
            data-testid="invite-dialog-popup"
            className="fixed inset-s-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-2xl transition-opacity outline-none rtl:translate-x-1/2"
          >
            <div className="flex items-center justify-between pb-4">
              <div className="flex items-center gap-2 text-primary">
                <UserPlus className="size-5" />
                <h3 className="text-base font-bold text-foreground">{t("inviteModalTitle")}</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsInviteOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
                <span className="sr-only">{t("close")}</span>
              </button>
            </div>

            <p className="pb-4 text-xs text-muted-foreground">{t("inviteModalDesc")}</p>

            {inviteError && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{inviteError}</span>
              </div>
            )}

            <form onSubmit={handleSendInvite} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email">{t("inviteEmailLabel")}</Label>
                <Input
                  id="invite-email"
                  data-testid="invite-email-input"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder={t("inviteEmailPlaceholder")}
                  required
                  disabled={isInviting}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="invite-role">{t("inviteRoleLabel")}</Label>
                <select
                  id="invite-role"
                  data-testid="invite-role-select"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as "admin" | "employee")}
                  disabled={isInviting}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="employee">{t("roleEmployee")}</option>
                  <option value="admin">{t("roleAdmin")}</option>
                </select>
                <p className="text-[11px] text-muted-foreground">
                  {inviteRole === "admin" ? t("roleAdminDesc") : t("roleEmployeeDesc")}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsInviteOpen(false)}
                  disabled={isInviting}
                >
                  {t("close")}
                </Button>
                <Button
                  type="submit"
                  data-testid="send-invite-button"
                  disabled={isInviting || !inviteEmail.trim()}
                >
                  {isInviting ? (
                    <>
                      <Loader2 className="me-2 size-4 animate-spin" />
                      <span>{t("sendInvite")}</span>
                    </>
                  ) : (
                    t("sendInvite")
                  )}
                </Button>
              </div>
            </form>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Remove Member Confirmation Modal */}
      <DialogPrimitive.Root
        open={Boolean(memberToDelete)}
        onOpenChange={(open) => {
          if (!open) setMemberToDelete(null);
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs transition-opacity" />
          <DialogPrimitive.Popup
            data-testid="remove-member-confirm-modal"
            className="fixed inset-s-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-6 shadow-2xl transition-opacity outline-none rtl:translate-x-1/2"
          >
            <div className="flex items-center justify-between pb-3">
              <h3 className="text-base font-bold text-foreground">
                {t("removeMemberConfirmTitle")}
              </h3>
              <button
                type="button"
                onClick={() => setMemberToDelete(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
                <span className="sr-only">{t("close")}</span>
              </button>
            </div>
            <p className="pb-4 text-xs text-muted-foreground">{t("removeMemberConfirmDesc")}</p>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setMemberToDelete(null)}>
                {t("cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                data-testid="confirm-remove-member-button"
                onClick={() => {
                  if (memberToDelete) {
                    const id = memberToDelete;
                    setMemberToDelete(null);
                    handleRemoveMember(id);
                  }
                }}
              >
                {t("removeMember")}
              </Button>
            </div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
