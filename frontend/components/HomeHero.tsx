"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import HeroIllustration from "@/components/HeroIllustration";

// The homepage's hero section is a client component (rather than inline in the
// Server Component page) so it can pick up the visitor's chosen locale after
// hydration — see i18n/request.ts for why the server always renders English.
export default function HomeHero() {
  const t = useTranslations("home");

  return (
    <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
      <div>
        {/* Badge — a neutral, non-fabricated tagline (no invented user counts) */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[color-mix(in_srgb,var(--fill-plum)_10%,transparent)] border border-[color-mix(in_srgb,var(--border-plum)_30%,transparent)] text-[var(--text-secondary)] text-sm font-medium mb-6">
          <span className="w-2 h-2 rounded-full bg-[var(--fill-plum)] animate-pulse"></span>
          {t("badge")}
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold text-[var(--text-primary)] leading-tight">
          {t("headingPrefix")}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--text-primary)] to-[var(--text-secondary)]"> {t("headingEmphasis")}</span> {t("headingSuffix")}
        </h1>
        <p className="mt-4 text-[var(--text-muted)] max-w-xl text-lg">
          {t("subtitle")}
        </p>

        <div className="mt-8 flex flex-wrap gap-4">
          <Link
            href="/signup"
            className="inline-block px-8 py-4 bg-gradient-to-r from-[#29104A] to-[#522C5D] text-[#DEDCDC] font-semibold rounded-xl shadow-elegant hover:shadow-glow transition-all duration-300 hover:-translate-y-1"
          >
            {t("startHosting")}
          </Link>

          <Link
            href="/events"
            className="inline-block px-8 py-4 bg-[var(--surface-card)] border-2 border-[var(--border-mauve)] text-[var(--text-primary)] font-semibold rounded-xl hover:bg-[var(--fill-mauve)] hover:text-[#DEDCDC] transition-all duration-300"
          >
            {t("discoverEvents")}
          </Link>
        </div>

        {/* Sponsor CTA */}
        <Link href="/sponsor" className="mt-10 block max-w-md">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-[#29104A]/5 to-[#522C5D]/10 border border-[color-mix(in_srgb,var(--border-plum)_30%,transparent)] hover:border-[var(--border-plum)] hover:shadow-lg transition-all duration-300 group cursor-pointer">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#29104A] to-[#522C5D] flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-[var(--text-primary)]">{t("sponsorTitle")}</p>
              <p className="text-sm text-[var(--text-muted)]">{t("sponsorBody")}</p>
            </div>
            <svg className="w-5 h-5 text-[var(--text-secondary)] group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      </div>

      <aside className="order-first lg:order-last lg:scale-105">
        <HeroIllustration />
      </aside>
    </section>
  );
}
