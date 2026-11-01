import React from "react";

import { AuthCardShell } from "@/components/auth/auth-card-shell";
import { GuestGuard } from "@/components/auth/guest-guard";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <AuthCardShell>
      <GuestGuard>
        <RegisterForm />
      </GuestGuard>
    </AuthCardShell>
  );
}
