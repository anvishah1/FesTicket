import type { NextConfig } from "next";

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

export default nextConfig;
