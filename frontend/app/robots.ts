import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/serverApi";

// SEO-04: crawl policy. Allow public content; keep crawlers out of operational
// routes (admin/host dashboards, auth, and the per-event booking/payment funnel)
// so private/transactional pages don't get indexed. Origin comes from
// NEXT_PUBLIC_SITE_URL via siteUrl() — never a hardcoded localhost.

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/host",
        "/signin",
        "/signup",
        "/forgot",
        "/reset",
        "/bookings",
        "/booking-confirmation",
        "/events/*/booking",
        "/events/*/payment",
      ],
    },
    sitemap: siteUrl("/sitemap.xml"),
  };
}
