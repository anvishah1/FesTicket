"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";

// Client component for the same reason as HomeHero — see that file's comment.
export default function HomeFeatures() {
  const t = useTranslations("home");

  return (
    <>
      <section className="mt-20">
        <div className="text-center mb-10">
          <h3 className="text-2xl font-bold text-[var(--text-primary)]">{t("featuresTitle")}</h3>
          <p className="text-[var(--text-muted)] mt-2">{t("featuresSubtitle")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-mauve)] hover:shadow-elegant transition-all duration-300 hover:-translate-y-1 group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#29104A] to-[#522C5D] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6 text-[#DEDCDC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <h4 className="font-bold text-[var(--text-primary)] text-lg">{t("createEventsTitle")}</h4>
            <p className="text-[var(--text-secondary)] mt-2">{t("createEventsBody")}</p>
          </div>
          <div className="p-6 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-mauve)] hover:shadow-elegant transition-all duration-300 hover:-translate-y-1 group">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#522C5D] to-[#6B597F] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <svg className="w-6 h-6 text-[#DEDCDC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
              </svg>
            </div>
            <h4 className="font-bold text-[var(--text-primary)] text-lg">{t("sellTicketsTitle")}</h4>
            <p className="text-[var(--text-secondary)] mt-2">{t("sellTicketsBody")}</p>
          </div>
          <Link href="/admin/signin" className="block">
            <div className="p-6 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-mauve)] hover:shadow-elegant transition-all duration-300 hover:-translate-y-1 group cursor-pointer">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6B597F] to-[#522C5D] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-[#DEDCDC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h4 className="font-bold text-[var(--text-primary)] text-lg">{t("manageAttendeesTitle")}</h4>
              <p className="text-[var(--text-secondary)] mt-2">{t("manageAttendeesBody")}</p>
              <span className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                {t("adminPortal")}
                <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </div>
          </Link>
        </div>
      </section>

      <section className="mt-20 bg-gradient-to-r from-[#29104A] to-[#522C5D] p-10 rounded-3xl shadow-elegant">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h4 className="text-2xl font-bold text-[#C5BAC4]">{t("ctaTitle")}</h4>
            <p className="text-[#DEDCDC]/80 mt-2">{t("ctaBody")}</p>
          </div>
          <div className="flex gap-4">
            <Link
              href="/signup"
              className="px-6 py-3 bg-[var(--surface-card)] text-[var(--text-primary)] font-semibold rounded-xl hover:bg-[var(--surface-page)] transition-colors"
            >
              {t("ctaStartHosting")}
            </Link>
            <Link
              href="/events"
              className="px-6 py-3 border-2 border-[color-mix(in_srgb,var(--border-card)_50%,transparent)] text-[#C5BAC4] font-semibold rounded-xl hover:bg-[color-mix(in_srgb,var(--surface-card)_10%,transparent)] transition-colors"
            >
              {t("ctaDiscover")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
