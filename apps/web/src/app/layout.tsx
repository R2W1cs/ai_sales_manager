import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { cookies } from "next/headers";

import "@fontsource-variable/noto-sans";

import "../index.css";
import Providers from "@/components/providers";
import { getLocaleDirection, getMessagesForLocale, resolveLocale } from "@/i18n/request";

export const metadata: Metadata = {
  title: "AI Sales Agent",
  description: "Plateforme de gestion et d'automatisation des ventes par IA",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const rawLocaleCookie = cookieStore.get("NEXT_LOCALE")?.value;
  const canonicalLocale = resolveLocale(rawLocaleCookie);
  const dir = getLocaleDirection(canonicalLocale);
  const messages = await getMessagesForLocale(canonicalLocale);

  return (
    <html lang={canonicalLocale} dir={dir} className="light" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground" suppressHydrationWarning>
        <NextIntlClientProvider key={canonicalLocale} locale={canonicalLocale} messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
