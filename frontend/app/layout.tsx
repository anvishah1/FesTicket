import "../globals.css";
import "leaflet/dist/leaflet.css";
import type { Metadata, Viewport } from "next";
import ClientRoot from "./_ClientRoot";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  ),
  title: {
    default: "tiqr — Events & ticketing",
    template: "%s | tiqr",
  },
  description:
    "tiqr is the fastest way to discover, book, and manage tickets for college fest events. Browse fests, grab your passes, and organise events all in one place.",
  applicationName: "tiqr",
  // TIX-08: Next auto-links the manifest from app/manifest.ts, but declaring it
  // keeps the intent explicit. appleWebApp enables iOS "Add to Home Screen" with
  // a standalone shell and the correct title.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "tiqr",
  },
  openGraph: {
    title: "tiqr — Events & ticketing for college fests",
    description:
      "Discover, book, and manage tickets for college fest events with tiqr.",
    siteName: "tiqr",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "tiqr — Events & ticketing for college fests",
    description:
      "Discover, book, and manage tickets for college fest events with tiqr.",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

// TIX-08: PWA theme color for the browser/OS chrome (must match the manifest
// theme_color and the brand primary).
export const viewport: Viewport = {
  themeColor: "#522C5D",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ClientRoot>{children}</ClientRoot>
      </body>
    </html>
  );
}
