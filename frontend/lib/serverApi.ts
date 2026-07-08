// frontend/lib/serverApi.ts
//
// SEO-01: server-only fetch helper for Server Components / generateMetadata.
// getApiUrl() (lib/auth) reads only NEXT_PUBLIC_API_URL (the browser origin);
// the Next server runtime may reach the backend on a different internal URL, so
// prefer INTERNAL_API_URL and fall back to NEXT_PUBLIC_API_URL.

const API_BASE = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ServerFetch<T> = { status: number; data: T | null; body: any };

/**
 * Fetch a public backend read on the server. Returns { status, data } so callers
 * can distinguish a genuine 404 (-> notFound()) from a transient error (status 0
 * / 5xx -> render with a null fallback instead of a wrong 404).
 * Pass `revalidate` (seconds) for ISR caching, else the response is uncached.
 */
export async function serverFetch<T = unknown>(
  path: string,
  opts?: { revalidate?: number }
): Promise<ServerFetch<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...(opts?.revalidate != null ? { next: { revalidate: opts.revalidate } } : { cache: "no-store" }),
      headers: { Accept: "application/json" },
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, data: (body?.data ?? null) as T | null, body };
  } catch {
    return { status: 0, data: null, body: null }; // network/unreachable — transient
  }
}

/** Absolute site URL for canonicals / OG, from NEXT_PUBLIC_SITE_URL. */
export function siteUrl(path = ""): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path.startsWith("/") || path === "" ? path : `/${path}`}`;
}
