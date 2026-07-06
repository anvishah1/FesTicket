const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function getApiUrl(): string {
  return API_URL;
}

/**
 * Unwrap the unified API response envelope
 * ({ success, data, message?, error?, requestId }) into its `data` payload.
 *
 * On an error envelope ({ success:false, error:{ code, message, details? } })
 * it throws an Error whose `.message` is the server's `error.message`, with the
 * machine `code` and any field-level `details` attached to the thrown error so
 * callers can inspect them. This is an opt-in helper: callers that want the raw
 * Response keep using `apiFetch`; those that want the payload use `unwrap`.
 */
export async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!body?.success) {
    const err = new Error(body?.error?.message) as Error & {
      code?: string;
      details?: Record<string, string>;
    };
    err.code = body?.error?.code;
    err.details = body?.error?.details;
    throw err;
  }
  return body.data as T;
}

const ACCESS_TOKEN_KEY = "auth_accessToken";
const REFRESH_TOKEN_KEY = "auth_refreshToken";
const USER_KEY = "auth_user";

export function setAuth(
  accessToken: string,
  refreshToken: string,
  user: { id: number; email: string; name?: string | null; role: string; profileCompleted: boolean; editorFestId?: number | null; managedFestId?: number | null }
) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getStoredUser(): {
  id: number;
  email: string;
  name?: string | null;
  role: string;
  profileCompleted: boolean;
  editorFestId?: number | null;
  managedFestId?: number | null;
} | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      id: number;
      email: string;
      name?: string | null;
      role: string;
      profileCompleted: boolean;
      editorFestId?: number | null;
      managedFestId?: number | null;
    };
  } catch {
    return null;
  }
}

/** Update only the stored user (e.g. after /me refetch). Merges with existing. */
export function updateStoredUser(updates: {
  id?: number;
  email?: string;
  name?: string | null;
  role?: string;
  profileCompleted?: boolean;
  editorFestId?: number | null;
  managedFestId?: number | null;
}): void {
  if (typeof window === "undefined") return;
  const current = getStoredUser();
  if (!current) return;
  const next = { ...current, ...updates };
  localStorage.setItem(USER_KEY, JSON.stringify(next));
}

export function clearAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem("adminAuth");
}

/**
 * User-initiated sign out. Best-effort revokes the refresh token on the server
 * (so it can't be used to mint new access tokens) and THEN clears local auth.
 * Server/network failure is ignored — local state is always cleared.
 */
export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  if (refreshToken) {
    try {
      await fetch(`${getApiUrl()}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // best-effort: ignore network/server errors and still clear local auth
    }
  }
  clearAuth();
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

/** Authorization header for authenticated API calls (empty object if no token). */
export function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Single-flight guard: while a refresh is in progress, every concurrent caller
 * awaits the SAME promise so a burst of parallel 401s triggers only ONE
 * /api/auth/refresh-token round-trip.
 */
let refreshPromise: Promise<boolean> | null = null;

/**
 * Exchange the stored refresh token for a fresh access+refresh token pair.
 * On success updates localStorage via setAuth and resolves `true`; on any
 * failure (no token, non-2xx, malformed body, network error) resolves `false`.
 * Concurrent calls share one in-flight request (single-flight).
 */
export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch(`${getApiUrl()}/api/auth/refresh-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      // Unified envelope: tokens/user live under `data`.
      const data = (await res.json())?.data;
      if (!data?.accessToken || !data?.refreshToken || !data?.user) return false;
      setAuth(data.accessToken, data.refreshToken, data.user);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Authenticated fetch wrapper.
 * - Prefixes getApiUrl() when `path` starts with "/" (absolute URLs pass through).
 * - Injects `Authorization: Bearer <access token>`, merging any caller headers.
 * - On a 401 with a refresh token available, refreshes ONCE (single-flight) and
 *   retries the original request a single time with the new token.
 * - If the refresh fails, clears auth and redirects to /signin — UNLESS
 *   `config.redirectOnAuthFailure` is false. Optional/enrichment calls (e.g. a
 *   dashboard /me self-heal) should pass false so a stale token can't bounce a
 *   user who is otherwise validly on the page; they just get the failed Response.
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
  config: { redirectOnAuthFailure?: boolean } = {}
): Promise<Response> {
  const { redirectOnAuthFailure = true } = config;
  const url = path.startsWith("/") ? `${getApiUrl()}${path}` : path;

  const doFetch = () => {
    const token = getAccessToken();
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    return fetch(url, { ...options, headers });
  };

  let res = await doFetch();

  if (res.status === 401 && getRefreshToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    } else if (redirectOnAuthFailure) {
      clearAuth();
      if (typeof window !== "undefined") {
        window.location.href = "/signin";
      }
    }
  }

  return res;
}
