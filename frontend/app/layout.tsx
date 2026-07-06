import "../globals.css";
import "leaflet/dist/leaflet.css";
import type { Metadata } from "next";
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
  },
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
