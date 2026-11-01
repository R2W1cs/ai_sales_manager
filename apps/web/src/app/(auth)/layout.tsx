import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Authentification | AI Sales Agent",
  description: "Plateforme de gestion et d'automatisation des ventes par IA",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-svh w-full bg-background text-foreground">{children}</div>;
}
