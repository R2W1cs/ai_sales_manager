import React from "react";

import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { GuestGuard } from "@/components/auth/guest-guard";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <AuthCardShell>
      <GuestGuard>
        <LoginForm />
      </GuestGuard>
    </AuthCardShell>
  );
}
