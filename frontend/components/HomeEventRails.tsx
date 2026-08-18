"use client";

import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { FALLBACK_POSTER } from "@/lib/images";
import Card from "@/components/card";

// SEO-06: "Trending now" + "Upcoming" rails for the homepage. A client component
// (rather than server-rendered) so it can pick up the visitor's chosen locale
// after hydration — see i18n/request.ts for why the server always renders
// English. Pure presentation (the page fetches the data); cards are
// <Link>-wrapped so the event URLs are crawlable and present in view-source.
// Each rail degrades to a friendly CTA when empty, or a distinct one on failure.

const FALLBACK_IMG = FALLBACK_POSTER;

interface RailEvent {
  id: number;
  name: string;
  startDate: string | null;
  venue: string | null;
  image: string | null;
  category: string | null;
  discount?: number;
  goingCount?: number;
  festName?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapEvent(e: any): RailEvent {
  return {
    id: e.id,
    name: e.name,
    startDate: e.startDate,
    venue: e.venue,
    image: e.image,
    category: e.category,
    discount: e.discount,
    goingCount: e.goingCount,
    festName: e.fest?.name ?? null,
  };
}

function EventRail({
  titleKey,
  subtitleKey,
  events,
  failed,
}: {
  titleKey: string;
  subtitleKey: string;
  events: RailEvent[];
  failed?: boolean;
}) {
  const t = useTranslations("home");
  const locale = useLocale();

  const dateVenue = (e: RailEvent): string => {
    const date = e.startDate
      ? new Date(e.startDate).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
      : t("dateTba");
    return `${date}${e.venue ? ` • ${e.venue}` : ""}`;
  };

  return (
    <section className="mt-16">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">{t(titleKey)}</h2>
          <p className="text-[var(--text-muted)] mt-1">{t(subtitleKey)}</p>
        </div>
        <Link href="/events" className="shrink-0 text-sm font-medium text-[var(--text-secondary)] hover:underline">
          {t("seeAll")}
        </Link>
      </div>
      {events.length > 0 ? (
        <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
          {events.map((e) => (
            <Link key={e.id} href={`/events/${e.id}`} className="block w-56 shrink-0 snap-start">
              <Card
                title={e.name}
                subtitle={e.category || e.festName || t("eventFallback")}
                description={dateVenue(e)}
                image={e.image || FALLBACK_IMG}
                discount={e.discount}
                going={e.goingCount}
                hoverText={t("viewDetails")}
              />
            </Link>
          ))}
        </div>
      ) : failed ? (
        <div role="alert" className="rounded-xl border border-dashed border-[var(--border-card)] p-8 text-center">
          <p className="text-[var(--text-muted)]">
            {t("railFailed")}{" "}
            <Link href="/events" className="font-medium text-[var(--text-secondary)] hover:underline">
              {t("railFailedCta")}
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[var(--border-card)] p-8 text-center">
          <p className="text-[var(--text-muted)]">
            {t("railEmpty")}{" "}
            <Link href="/events" className="font-medium text-[var(--text-secondary)] hover:underline">
              {t("railEmptyCta")}
            </Link>
            .
          </p>
        </div>
      )}
    </section>
  );
}

export default function HomeEventRails({
  trending,
  upcoming,
  trendingFailed,
  upcomingFailed,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trending: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upcoming: any[];
  trendingFailed?: boolean;
  upcomingFailed?: boolean;
}) {
  return (
    <>
      <EventRail
        titleKey="trendingTitle"
        subtitleKey="trendingSubtitle"
        events={(trending || []).map(mapEvent)}
        failed={trendingFailed}
      />
      <EventRail
        titleKey="upcomingTitle"
        subtitleKey="upcomingSubtitle"
        events={(upcoming || []).map(mapEvent)}
        failed={upcomingFailed}
      />
    </>
  );
}
