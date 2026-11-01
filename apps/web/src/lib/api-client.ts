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

// In-memory access token storage (ZERO localStorage)
let inMemoryAccessToken: string | null = null;

// Callbacks
type SessionExpiredHandler = () => void;
type TokenRefreshedHandler = (session: SessionDto) => void;

const sessionExpiredHandlers = new Set<SessionExpiredHandler>();
const tokenRefreshedHandlers = new Set<TokenRefreshedHandler>();

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function onSessionExpired(handler: SessionExpiredHandler): () => void {
  sessionExpiredHandlers.add(handler);
  return () => sessionExpiredHandlers.delete(handler);
}

export function onTokenRefreshed(handler: TokenRefreshedHandler): () => void {
  tokenRefreshedHandlers.add(handler);
  return () => tokenRefreshedHandlers.delete(handler);
}

// Single-flight 401/mount refresh promise
let refreshSessionPromise: Promise<SessionDto> | null = null;

export async function refreshSession(): Promise<SessionDto> {
  if (refreshSessionPromise) {
    return refreshSessionPromise;
  }

  refreshSessionPromise = (async () => {
    try {
      const refreshUrl =
        typeof window !== "undefined"
          ? "/api/v1/auth/refresh"
          : `${env.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`;
      const refreshRes = await fetch(refreshUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
        credentials: "include",
      });

      if (!refreshRes.ok) {
        const errData = await refreshRes.json().catch(() => ({}));
        throw new ApiClientError(
          refreshRes.status,
          errData?.error?.code ?? "unauthorized",
          errData?.error?.message ?? "Session refresh failed",
          errData?.error?.details,
          errData,
        );
      }

      const newSession = (await refreshRes.json()) as SessionDto;
      const newToken = newSession.accessToken ?? null;
      setAccessToken(newToken);

      // Notify all handlers
      tokenRefreshedHandlers.forEach((h) => h(newSession));
      return newSession;
    } catch (refreshErr) {
      // Clear session strictly on auth rejection (401/403), not on network drops or 5xx
      if (
        refreshErr instanceof ApiClientError &&
        (refreshErr.status === 401 || refreshErr.status === 403)
      ) {
        setAccessToken(null);
        sessionExpiredHandlers.forEach((h) => h());
      }
      throw refreshErr;
    } finally {
      refreshSessionPromise = null;
    }
  })();

  return refreshSessionPromise;
}

async function requestTokenRefresh(): Promise<string | null> {
  try {
    const session = await refreshSession();
    return session.accessToken ?? null;
  } catch {
    return null;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  skipAuth?: boolean;
  skipRefresh?: boolean;
  _retry?: boolean;
  token?: string | null;
}

export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { body, headers, skipAuth, skipRefresh, _retry, token, ...init } = options;

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

  const isAuthEndpoint =
    path.includes("/auth/login") ||
    path.includes("/auth/register") ||
    path.includes("/auth/refresh") ||
    path.includes("/auth/invitations/accept");

  // Mutex Queue: Pause incoming requests while a refresh is in-flight to avoid redundant 401s
  let tokenToUse = token;
  if (tokenToUse === undefined) {
    if (refreshSessionPromise && !skipAuth && !skipRefresh && !isAuthEndpoint) {
      try {
        const refreshedSession = await refreshSessionPromise;
        tokenToUse = refreshedSession.accessToken ?? inMemoryAccessToken;
      } catch {
        tokenToUse = inMemoryAccessToken;
      }
    } else {
      tokenToUse = inMemoryAccessToken;
    }
  }

  if (!skipAuth && tokenToUse) {
    reqHeaders["Authorization"] = `Bearer ${tokenToUse}`;
  }

  const fetchOptions: RequestInit = {
    ...init,
    headers: reqHeaders,
    body: formattedBody,
    credentials: "include", // Essential for HttpOnly refresh cookie
  };

  const res = await fetch(url, fetchOptions);

  if (res.status === 401 && !skipRefresh && !_retry) {
    if (!isAuthEndpoint) {
      const refreshedToken = await requestTokenRefresh();

      // Retry original request using the exact token minted by this refresh flight
      return await apiRequest<T>(path, {
        ...options,
        token: refreshedToken,
        _retry: true,
      });
    }
  }

  // Handle errors
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
  getAccessToken,
  setAccessToken,
  onSessionExpired,
  onTokenRefreshed,
  refreshSession,
};
