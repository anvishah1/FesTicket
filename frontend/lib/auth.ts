const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function getApiUrl(): string {
  return API_URL;
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

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}
