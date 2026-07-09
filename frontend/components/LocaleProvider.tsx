// frontend/components/LocaleProvider.tsx
// FE-12: client-side locale application. The server renders statically in the
// default locale (English) so pages stay SSG/ISR-cacheable (FE-03). This provider
// reads the NEXT_LOCALE cookie after hydration and, for a non-default locale,
// lazy-loads its dictionary and re-provides it — plus it drives <html lang>.
"use client";

import { NextIntlClientProvider } from "next-intl";
import { createContext, useContext, useEffect, useState } from "react";
import en from "@/messages/en.json";

const COOKIE = "NEXT_LOCALE";
type Messages = typeof en;
type Locale = "en" | "hi";

// Dictionaries: English is bundled for a synchronous first render; others load
// on demand so they don't weigh down the default experience.
const LOADERS: Record<Locale, () => Promise<Messages>> = {
  en: () => Promise.resolve(en),
  hi: () => import("@/messages/hi.json").then((m) => m.default as Messages),
};

function cookieLocale(): Locale {
  if (typeof document === "undefined") return "en";
  const m = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
  const v = m?.[1];
  return v === "hi" || v === "en" ? v : "en";
}

/** Change the active locale app-wide (used by the Header locale switcher). */
export function setLocaleCookie(locale: Locale) {
  document.cookie = `${COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

const LocaleContext = createContext<{ locale: Locale; setLocale: (l: Locale) => void }>({
  locale: "en",
  setLocale: () => {},
});

export function useAppLocale() {
  return useContext(LocaleContext);
}

export default function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Start as "en" so SSR and the first client render agree (no hydration
  // mismatch); apply the cookie's locale immediately after mount.
  const [locale, setLocaleState] = useState<Locale>("en");
  const [messages, setMessages] = useState<Messages>(en);

  const apply = (target: Locale) => {
    document.documentElement.lang = target;
    LOADERS[target]().then((m) => {
      setMessages(m);
      setLocaleState(target);
    });
  };

  useEffect(() => {
    const target = cookieLocale();
    if (target !== "en") apply(target);
    else document.documentElement.lang = "en";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = (target: Locale) => {
    setLocaleCookie(target);
    apply(target);
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
