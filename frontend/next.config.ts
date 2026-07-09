import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

// FE-12: point next-intl at the request config (cookie-based locale, no routing).
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// FE-01: enumerate allowed image hosts for next/image and prefer modern formats.
// Unsplash is the shared card fallback; the backend host serves /uploads posters.
// (next/image hard-fails on any remote host not listed here; PosterImage renders
// arbitrary/relative sources unoptimized so those never reach the optimizer.)
function apiRemotePattern() {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000");
    return {
      protocol: u.protocol.replace(":", "") as "http" | "https",
      hostname: u.hostname,
      ...(u.port ? { port: u.port } : {}),
      pathname: "/uploads/**",
    };
  } catch {
    return null;
  }
}

const apiPattern = apiRemotePattern();

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      ...(apiPattern ? [apiPattern] : []),
    ],
  },
};

// OPS-02: wrap with Sentry. Runtime Sentry is gated on NEXT_PUBLIC_SENTRY_DSN in
// the instrumentation files, so with no DSN the app runs identically. Source-map
// upload only happens when SENTRY_AUTH_TOKEN is present, so local/CI builds
// without the token still succeed.
export default withSentryConfig(withNextIntl(nextConfig), {
  silent: !process.env.CI,
  telemetry: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
});
