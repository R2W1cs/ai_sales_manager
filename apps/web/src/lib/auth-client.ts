import { organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { env } from "@app/shared/web";

export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : env.NEXT_PUBLIC_API_URL,
  plugins: [
    organizationClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        if (typeof window !== "undefined") {
          const current = new URL(window.location.href);
          const redirect = current.searchParams.get("redirect");
          window.location.href = redirect
            ? `/2fa?redirect=${encodeURIComponent(redirect)}`
            : "/2fa";
        }
      },
    }),
  ],
});

export const { signIn, signOut, signUp, useSession, organization, twoFactor } = authClient;
