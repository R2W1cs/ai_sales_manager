"use client";

import { AuthProvider } from "@/providers/auth-provider";

import { ThemeProvider } from "./theme-provider";
import { Toaster } from "./ui/sonner";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      forcedTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      <AuthProvider>
        {children}
        <Toaster richColors />
      </AuthProvider>
    </ThemeProvider>
  );
}
