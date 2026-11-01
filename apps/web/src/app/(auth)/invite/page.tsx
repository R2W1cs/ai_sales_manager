import { getTranslations } from "next-intl/server";
import React, { Suspense } from "react";

import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { Card } from "@/components/ui/card";

export default async function InvitePage() {
  const tAuth = await getTranslations("auth");

  return (
    <AuthCardShell>
      <Suspense
        fallback={
          <Card className="w-full border border-border p-6 text-center text-xs text-muted-foreground shadow-sm">
            {tAuth("inviteLoading")}
          </Card>
        }
      >
        <AcceptInviteForm />
      </Suspense>
    </AuthCardShell>
  );
}
