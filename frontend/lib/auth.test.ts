import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as auth from "@/lib/auth";

beforeEach(() => localStorage.clear());

const sampleUser = {
  id: 1,
  email: "a@b.com",
  name: "Aay",
  role: "VIEWER",
  profileCompleted: false,
};

describe("lib/auth", () => {
  it("getApiUrl falls back to localhost:4000 when env is unset", () => {
    expect(auth.getApiUrl()).toBe("http://localhost:4000");
  });

  it("setAuth stores tokens + user and the getters read them back", () => {
    auth.setAuth("access-tok", "refresh-tok", sampleUser);
    expect(auth.getAccessToken()).toBe("access-tok");
    expect(auth.getRefreshToken()).toBe("refresh-tok");
    expect(auth.getStoredUser()?.email).toBe("a@b.com");
    expect(auth.isAuthenticated()).toBe(true);
  });

  it("isAuthenticated is false with no stored token", () => {
    expect(auth.isAuthenticated()).toBe(false);
    expect(auth.getAccessToken()).toBeNull();
  });

  it("updateStoredUser merges into the existing user", () => {
    auth.setAuth("a", "r", sampleUser);
    auth.updateStoredUser({ role: "EDITOR", editorFestId: 3 });
    const u = auth.getStoredUser();
    expect(u?.role).toBe("EDITOR");
    expect(u?.editorFestId).toBe(3);
    expect(u?.email).toBe("a@b.com");
  });

  it("updateStoredUser is a no-op when there is no stored user", () => {
    auth.updateStoredUser({ role: "ADMIN" });
    expect(auth.getStoredUser()).toBeNull();
  });

  it("clearAuth removes tokens, user and legacy adminAuth key", () => {
    auth.setAuth("a", "r", sampleUser);
    localStorage.setItem("adminAuth", "1");
    auth.clearAuth();
    expect(auth.getAccessToken()).toBeNull();
    expect(auth.getRefreshToken()).toBeNull();
    expect(auth.getStoredUser()).toBeNull();
    expect(localStorage.getItem("adminAuth")).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it("getStoredUser returns null when stored JSON is corrupt", () => {
    localStorage.setItem("auth_user", "{not valid json");
    expect(auth.getStoredUser()).toBeNull();
  });
});

const refreshedUser = {
  id: 1,
  email: "a@b.com",
  name: "Aay",
  role: "EDITOR",
  profileCompleted: true,
};

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  };
}

describe("lib/auth refreshAccessToken", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  it("returns false and does not call the API when there is no refresh token", async () => {
    const ok = await auth.refreshAccessToken();
    expect(ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts the refresh token, stores the rotated pair, and returns true", async () => {
    auth.setAuth("old-access", "old-refresh", { ...refreshedUser, role: "VIEWER" });
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ accessToken: "new-access", refreshToken: "new-refresh", user: refreshedUser })
    ) as unknown as typeof fetch;

    const ok = await auth.refreshAccessToken();

    expect(ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/auth/refresh-token"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ refreshToken: "old-refresh" }),
      })
    );
    // rotated tokens + user are persisted via setAuth
    expect(auth.getAccessToken()).toBe("new-access");
    expect(auth.getRefreshToken()).toBe("new-refresh");
    expect(auth.getStoredUser()?.role).toBe("EDITOR");
  });

  it("returns false on a non-2xx refresh response", async () => {
    auth.setAuth("old-access", "old-refresh", refreshedUser);
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { ok: false, status: 401 })) as unknown as typeof fetch;
    expect(await auth.refreshAccessToken()).toBe(false);
  });

  it("returns false when the refresh network call throws", async () => {
    auth.setAuth("old-access", "old-refresh", refreshedUser);
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    expect(await auth.refreshAccessToken()).toBe(false);
  });
});

describe("lib/auth apiFetch", () => {
  let originalLocation: Location;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { href: "" } as Location,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it("prefixes getApiUrl() when the path starts with '/' and injects the bearer token", async () => {
    auth.setAuth("tok", "ref", sampleUser);
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true })) as unknown as typeof fetch;

    await auth.apiFetch("/api/thing");

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/thing",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok" }),
      })
    );
  });

  it("passes absolute URLs through unchanged and merges caller headers", async () => {
    auth.setAuth("tok", "ref", sampleUser);
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true })) as unknown as typeof fetch;

    await auth.apiFetch("http://localhost:4000/api/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/x",
      expect.objectContaining({
        method: "POST",
        body: "{}",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer tok",
        }),
      })
    );
  });

  it("on a 401 refreshes ONCE and retries the original request with the new token", async () => {
    auth.setAuth("stale", "ref", sampleUser);
    const fetchMock = vi
      .fn()
      // 1) original request -> 401
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 401 }))
      // 2) refresh-token -> new pair
      .mockResolvedValueOnce(
        jsonResponse({ accessToken: "fresh", refreshToken: "ref2", user: sampleUser })
      )
      // 3) retried original request -> 200
      .mockResolvedValueOnce(jsonResponse({ done: true }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await auth.apiFetch("/api/protected");

    // original + refresh + retry = 3 calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain("/api/auth/refresh-token");
    // retry carries the refreshed token
    expect(fetchMock.mock.calls[2][1].headers).toMatchObject({ Authorization: "Bearer fresh" });
    expect(res.ok).toBe(true);
    expect(auth.getAccessToken()).toBe("fresh");
  });

  it("triggers only ONE refresh for concurrent 401s (single-flight)", async () => {
    auth.setAuth("stale", "ref", sampleUser);
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/auth/refresh-token")) {
        return Promise.resolve(
          jsonResponse({ accessToken: "fresh", refreshToken: "ref2", user: sampleUser })
        );
      }
      // every protected call: 401 first (stale token), 200 once refreshed
      return Promise.resolve(
        auth.getAccessToken() === "fresh"
          ? jsonResponse({ done: true })
          : jsonResponse({}, { ok: false, status: 401 })
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await Promise.all([auth.apiFetch("/api/a"), auth.apiFetch("/api/b")]);

    const refreshCalls = fetchMock.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("/api/auth/refresh-token")
    );
    expect(refreshCalls).toHaveLength(1);
  });

  it("clears auth and redirects to /signin when the refresh fails", async () => {
    auth.setAuth("stale", "ref", sampleUser);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 401 })) // original -> 401
      .mockResolvedValueOnce(jsonResponse({}, { ok: false, status: 401 })); // refresh -> fail
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await auth.apiFetch("/api/protected");

    expect(auth.getAccessToken()).toBeNull();
    expect(auth.getRefreshToken()).toBeNull();
    expect(window.location.href).toBe("/signin");
  });

  it("does not attempt a refresh on a 401 when there is no refresh token", async () => {
    auth.setAuth("tok", "", sampleUser); // no refresh token
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({}, { ok: false, status: 401 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await auth.apiFetch("/api/protected");

    expect(fetchMock).toHaveBeenCalledTimes(1); // no refresh, no retry
    expect(res.status).toBe(401);
  });
});
