import type { MetadataRoute } from "next";

// TIX-08: Web App Manifest. Makes FesTicket installable (Chrome install prompt / iOS
// Add to Home Screen) and drives the standalone app-shell look. Icons live in
// /public (generated brand "t" marks). Keep theme_color in sync with the brand
// primary (#522C5D) used across the UI.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FesTicket — Events & ticketing",
    short_name: "FesTicket",
    description:
      "Discover, book, and manage tickets for college fest events. Your ticket QR stays available at the gate, even offline.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#522C5D",
    categories: ["events", "entertainment", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
