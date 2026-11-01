import "@app/shared/web";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const appDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(appDir, "../..");
const turbopackRoot = existsSync(join(workspaceRoot, "packages")) ? workspaceRoot : appDir;

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  turbopack: {
    root: turbopackRoot,
  },
  output: "standalone",
  outputFileTracingRoot: workspaceRoot,
  allowedDevOrigins: ["mumbling-landfill-caddie.ngrok-free.dev"],
  async rewrites() {
    const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const apiUrl = rawApiUrl.replace("//localhost:", "//127.0.0.1:");
    return [
      {
        source: "/health",
        destination: `${apiUrl}/health`,
      },
      {
        source: "/api/v1/:path*",
        destination: `${apiUrl}/api/v1/:path*`,
      },
      {
        source: "/integrations/:path*",
        destination: `${apiUrl}/integrations/:path*`,
      },
      {
        source: "/webhooks/:path*",
        destination: `${apiUrl}/webhooks/:path*`,
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
