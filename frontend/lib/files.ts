import { getApiUrl, apiFetch } from "@/lib/auth";

/**
 * Resolve a stored marketing-file URL (expense proof/bill, sponsor agreement)
 * into something usable in <img>/<iframe>/<a>.
 *
 * Uploaded files are no longer served from a public /uploads mount — they're
 * streamed through the authenticated, fest-scoped route
 * GET /api/events/marketing/files/:filename (L3). Since <img>/<iframe>/<a> can't
 * send an Authorization header, we fetch the file with the bearer token and hand
 * back an object URL.
 *
 * - data:/blob:/http(s) URLs pass through unchanged.
 * - A stored "/uploads/<name>" (or any path ending in the filename) is fetched
 *   through the authed route; the returned object URL MUST be released with
 *   URL.revokeObjectURL when no longer displayed.
 * Returns "" if there is nothing to show or the fetch is unauthorized/fails.
 */
export async function resolveMarketingFile(stored: string): Promise<string> {
  if (!stored) return "";
  if (/^(data:|blob:|https?:)/i.test(stored)) return stored;
  const name = stored.split("/").pop() || "";
  if (!name) return "";
  try {
    const res = await apiFetch(
      `${getApiUrl()}/api/events/marketing/files/${encodeURIComponent(name)}`
    );
    if (!res.ok) return "";
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return "";
  }
}

/** True if the stored value points at a backend-hosted upload (needs auth fetch). */
export function isHostedUpload(stored: string): boolean {
  return !!stored && !/^(data:|blob:|https?:)/i.test(stored);
}

/**
 * Fetch a stored marketing file through the authenticated route and trigger a
 * download / open. Returns false if there was nothing to fetch or the caller
 * isn't allowed to see it (so callers can surface an error).
 */
export async function downloadMarketingFile(stored: string, name?: string): Promise<boolean> {
  const src = await resolveMarketingFile(stored);
  if (!src) return false;
  const a = document.createElement("a");
  a.href = src;
  a.download = name || "file";
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (src.startsWith("blob:")) setTimeout(() => URL.revokeObjectURL(src), 10_000);
  return true;
}
