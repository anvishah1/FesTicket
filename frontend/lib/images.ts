// frontend/lib/images.ts
//
// FE-01: shared poster-image constants + helpers. The Unsplash fallback string
// was duplicated across ~7 files; centralize it here to avoid drift. next/image
// hard-fails on a remote host not listed in next.config images.remotePatterns, so
// isOptimizablePoster() decides whether a given src can be run through the Next
// optimizer or must pass through unoptimized (data:/relative/uploads/arbitrary
// pasted hosts).

export const FALLBACK_POSTER =
  "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop";

const UNSPLASH_HOST = "images.unsplash.com";

function apiHost(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000").host;
  } catch {
    return null;
  }
}

// Only an absolute http(s) URL on an allowlisted host (Unsplash + the backend
// uploads host) can be optimized by next/image without a build/render error.
// Everything else — data: URIs, relative /uploads paths, and arbitrary hosts an
// organizer might paste — is passed through unoptimized (rendered as-is).
export function isOptimizablePoster(src?: string | null): boolean {
  if (!src || !/^https?:\/\//i.test(src)) return false;
  try {
    const host = new URL(src).host;
    return host === UNSPLASH_HOST || host === apiHost();
  } catch {
    return false;
  }
}
