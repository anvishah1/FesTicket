// frontend/app/page.tsx
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HomeHero from "@/components/HomeHero";
import HomeEventRails from "@/components/HomeEventRails";
import HomeFeatures from "@/components/HomeFeatures";
import { serverFetch } from "@/lib/serverApi";

// SEO-06: server-render real Trending + Upcoming rails from live data so the
// homepage has crawlable event links (instead of the old fabricated badge).
// The visible copy itself lives in HomeHero/HomeEventRails/HomeFeatures — client
// components so the visitor's chosen locale can apply after hydration (i18n/
// request.ts explains why this Server Component always renders in English).
export const revalidate = 120;

export default async function Home() {
  const nowIso = new Date().toISOString();
  const [trendingRes, upcomingRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    serverFetch<any[]>("/api/events?sort=trending&limit=8", { revalidate }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    serverFetch<any[]>(`/api/events?sort=date&dateFrom=${encodeURIComponent(nowIso)}&limit=8`, { revalidate }),
  ]);
  let trending = Array.isArray(trendingRes.data) ? trendingRes.data : [];
  // `data === null` is serverFetch's signal for a failed request (network error
  // or non-2xx) — distinct from a genuine empty array, which must not render
  // the same "no events yet" copy as an actual outage.
  let trendingFailed = trendingRes.data === null;
  // Fall back to newest if trending isn't available (e.g. no data yet).
  if (!trending.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fb = await serverFetch<any[]>("/api/events?sort=newest&limit=8", { revalidate });
    trending = Array.isArray(fb.data) ? fb.data : [];
    // Only still "failed" if the fallback attempt also failed — a genuinely
    // empty trending list that falls back to an equally-empty newest list is
    // a real empty result, not an error.
    trendingFailed = trendingFailed && fb.data === null;
  }
  const upcoming = Array.isArray(upcomingRes.data) ? upcomingRes.data : [];
  const upcomingFailed = upcomingRes.data === null;

  return (
    <div className="min-h-screen bg-[var(--surface-tint)]">
      <Header />

      <main className="container py-12">
        <HomeHero />

        {/* SEO-06: live Trending + Upcoming event rails */}
        <HomeEventRails
          trending={trending}
          upcoming={upcoming}
          trendingFailed={trendingFailed}
          upcomingFailed={upcomingFailed}
        />

        <HomeFeatures />
      </main>
      <Footer />
    </div>
  );
}
