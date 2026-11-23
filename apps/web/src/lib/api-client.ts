import type { SessionDto } from "@app/shared";
import { env } from "@app/shared/web";

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public raw?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

type SessionExpiredHandler = () => void;
type TokenRefreshedHandler = (session: SessionDto) => void;
type MfaRequiredHandler = (kind: "mfa_setup_required" | "mfa_required") => void;

const sessionExpiredHandlers = new Set<SessionExpiredHandler>();
const tokenRefreshedHandlers = new Set<TokenRefreshedHandler>();
const mfaRequiredHandlers = new Set<MfaRequiredHandler>();

export function onSessionExpired(handler: SessionExpiredHandler): () => void {
  sessionExpiredHandlers.add(handler);
  return () => sessionExpiredHandlers.delete(handler);
}

export function onTokenRefreshed(handler: TokenRefreshedHandler): () => void {
  tokenRefreshedHandlers.add(handler);
  return () => tokenRefreshedHandlers.delete(handler);
}

export function onMfaRequired(handler: MfaRequiredHandler): () => void {
  mfaRequiredHandlers.add(handler);
  return () => mfaRequiredHandlers.delete(handler);
}

let bootstrapPromise: Promise<SessionDto> | null = null;

/**
 * Loads the authoritative Better Auth user + workspace memberships from `GET /api/v1/workspaces`
 * using the HttpOnly Better Auth session cookie.
 */
export async function refreshSession(): Promise<SessionDto> {
  if (bootstrapPromise) {
    return bootstrapPromise;
  }

  bootstrapPromise = (async () => {
    try {
      const bootstrapUrl =
        typeof window !== "undefined"
          ? "/api/v1/workspaces"
          : `${env.NEXT_PUBLIC_API_URL}/api/v1/workspaces`;
      const res = await fetch(bootstrapUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        credentials: "include",
      });

      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as ApiErrorPayload;
        throw new ApiClientError(
          res.status,
          errData?.error?.code ?? "unauthorized",
          errData?.error?.message ?? "Session bootstrap failed",
          errData?.error?.details,
          errData,
        );
      }

      const session = (await res.json()) as SessionDto;
      tokenRefreshedHandlers.forEach((h) => h(session));
      return session;
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        sessionExpiredHandlers.forEach((h) => h());
      }
      throw err;
    } finally {
      bootstrapPromise = null;
    }
  })();

  return bootstrapPromise;
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { body, headers, ...init } = options;

  const baseUrl = typeof window !== "undefined" ? "" : env.NEXT_PUBLIC_API_URL;
  const url =
    path.startsWith("http://") || path.startsWith("https://")
      ? path
      : `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

  const reqHeaders: Record<string, string> = {
    Accept: "application/json",
    ...((headers as Record<string, string>) || {}),
  };

  let formattedBody: BodyInit | undefined;
  if (body !== undefined) {
    if (body instanceof FormData || typeof body === "string" || body instanceof Blob) {
      formattedBody = body as BodyInit;
    } else {
      reqHeaders["Content-Type"] = "application/json";
      formattedBody = JSON.stringify(body);
    }
  }

  const fetchOptions: RequestInit = {
    ...init,
    headers: reqHeaders,
    body: formattedBody,
    credentials: "include",
  };

  const res = await fetch(url, fetchOptions);

  if (!res.ok) {
    let errorData: ApiErrorPayload | null = null;
    try {
      errorData = (await res.json()) as ApiErrorPayload;
    } catch {
      // response was not json
    }

    const code =
      errorData?.error?.code ??
      (res.status === 401
        ? "unauthorized"
        : res.status === 409
          ? "conflict"
          : res.status === 429
            ? "rate_limited"
            : res.status === 502 || res.status === 503 || res.status === 504
              ? "network_error"
              : res.status >= 500
                ? "internal_error"
                : "http_error");
    const message = errorData?.error?.message ?? `Request failed with status ${res.status}`;
    const details = errorData?.error?.details;

    if (res.status === 401) {
      sessionExpiredHandlers.forEach((h) => h());
    } else if (res.status === 403 && (code === "mfa_setup_required" || code === "mfa_required")) {
      mfaRequiredHandlers.forEach((h) => h(code));
    }

    throw new ApiClientError(res.status, code, message, details, errorData);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  return (await res.json()) as T;
}

export const apiClient = {
  get: <T = unknown>(path: string, options?: ApiRequestOptions) =>
    apiRequest<T>(path, { ...options, method: "GET" }),
  post: <T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),
  patch: <T = unknown>(path: string, body?: unknown, options?: ApiRequestOptions) =>
    apiRequest<T>(path, { ...options, method: "PATCH", body }),
  delete: <T = unknown>(path: string, options?: ApiRequestOptions) =>
    apiRequest<T>(path, { ...options, method: "DELETE" }),
  onSessionExpired,
  onTokenRefreshed,
  onMfaRequired,
  refreshSession,
};
