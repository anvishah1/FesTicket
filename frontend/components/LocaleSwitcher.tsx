// frontend/components/LocaleSwitcher.tsx
// FE-12: switches the active locale via the client LocaleProvider (which writes
// the NEXT_LOCALE cookie, swaps the dictionary in place, and updates <html lang>).
// No navigation/reload — the provider re-renders the translated tree.
"use client";

import { useTranslations } from "next-intl";
import { useAppLocale } from "@/components/LocaleProvider";

const LOCALES = ["en", "hi"] as const;

export default function LocaleSwitcher({ className = "" }: { className?: string }) {
  const t = useTranslations("locale");
  const { locale, setLocale } = useAppLocale();

  return (
    <label className={"relative inline-flex items-center " + className}>
      <span className="sr-only">{t("label")}</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as (typeof LOCALES)[number])}
        aria-label={t("label")}
        className="appearance-none bg-white/10 text-white text-sm rounded-lg pl-3 pr-8 py-2 hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/40 transition-colors cursor-pointer"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} className="text-[var(--text-primary)]">
            {t(l)}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-white/80"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </label>
  );
}
