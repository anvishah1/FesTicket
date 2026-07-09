import "../globals.css";
// FE-04: Leaflet CSS is imported inside components/EventMap.tsx (the dynamically
// imported map island) so it is code-split out of the global bundle.
import type { Metadata, Viewport } from "next";
import LocaleProvider from "@/components/LocaleProvider";
import ClientRoot from "./_ClientRoot";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  ),
  title: {
    default: "FesTicket — Events & ticketing",
    template: "%s | FesTicket",
  },
  description:
    "FesTicket is the fastest way to discover, book, and manage tickets for college fest events. Browse fests, grab your passes, and organise events all in one place.",
  applicationName: "FesTicket",
  // TIX-08: Next auto-links the manifest from app/manifest.ts, but declaring it
  // keeps the intent explicit. appleWebApp enables iOS "Add to Home Screen" with
  // a standalone shell and the correct title.
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FesTicket",
  },
  openGraph: {
    title: "FesTicket — Events & ticketing for college fests",
    description:
      "Discover, book, and manage tickets for college fest events with FesTicket.",
    siteName: "FesTicket",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "FesTicket — Events & ticketing for college fests",
    description:
      "Discover, book, and manage tickets for college fest events with FesTicket.",
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
  // <html lang> starts at the default locale so the page renders statically
  // (FE-03 SSG/ISR); the inline script below and LocaleProvider correct it from
  // the NEXT_LOCALE cookie before/at hydration (FE-12).
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {/* Before first paint: apply the stored theme (FE-11, no light->dark
            flash) and the chosen locale onto <html> (FE-12, correct lang). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('FesTicket-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}var m=document.cookie.match(/(?:^|;\\s*)NEXT_LOCALE=([^;]+)/);if(m&&(m[1]==='hi'||m[1]==='en')){document.documentElement.lang=m[1];}}catch(e){}})();",
          }}
        />
        <LocaleProvider>
          <ClientRoot>{children}</ClientRoot>
        </LocaleProvider>
      </body>
    </html>
  );
}
