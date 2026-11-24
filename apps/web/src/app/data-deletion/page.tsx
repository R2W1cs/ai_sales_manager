import type { Route } from "next";
import Link from "next/link";

import { env } from "@app/shared/web";

type DeletionStatus = "pending" | "completed" | "not_found";

async function fetchStatus(code: string): Promise<{
  confirmation_code: string;
  status: DeletionStatus;
  requested_at: string | null;
}> {
  const api = (env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:4000").replace(/\/$/, "");
  try {
    const res = await fetch(
      `${api}/api/v1/webhooks/meta/data-deletion-status?code=${encodeURIComponent(code)}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      return { confirmation_code: code, status: "not_found", requested_at: null };
    }
    return (await res.json()) as {
      confirmation_code: string;
      status: DeletionStatus;
      requested_at: string | null;
    };
  } catch {
    return { confirmation_code: code, status: "not_found", requested_at: null };
  }
}

export default async function DataDeletionStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code = "" } = await searchParams;
  const status = code
    ? await fetchStatus(code)
    : { confirmation_code: "", status: "not_found" as const, requested_at: null };

  const label =
    status.status === "completed"
      ? "Completed"
      : status.status === "pending"
        ? "Pending"
        : "Not found";

  return (
    <main className="mx-auto max-w-xl space-y-6 px-6 py-12 text-foreground">
      <p className="text-sm text-muted-foreground">
        <Link href={"/" as Route} className="underline-offset-4 hover:underline">
          AI Sales Manager
        </Link>{" "}
        · Data deletion
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">Data deletion request</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Meta App Review / user data deletion status. This page is the public confirmation URL
        returned by <code className="text-xs">POST /api/v1/webhooks/meta/data-deletion</code>.
      </p>

      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Confirmation code</dt>
          <dd className="font-mono text-xs break-all">{status.confirmation_code || "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Status</dt>
          <dd className="font-medium">{label}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Requested at</dt>
          <dd>{status.requested_at ?? "—"}</dd>
        </div>
      </dl>

      <p className="text-xs text-muted-foreground">
        Related:{" "}
        <Link href={"/privacy" as Route} className="underline-offset-4 hover:underline">
          Privacy Policy
        </Link>
      </p>
    </main>
  );
}
