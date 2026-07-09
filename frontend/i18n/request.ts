// FE-12: next-intl request config for the plugin. i18n is applied on the CLIENT
// (see components/LocaleProvider.tsx) so that pages stay statically renderable /
// ISR-cached (FE-03) — reading the locale cookie here would opt every route into
// dynamic rendering. The server therefore always renders the default locale and
// the client swaps in the chosen locale after hydration.
import { getRequestConfig } from "next-intl/server";

export const LOCALE_COOKIE = "NEXT_LOCALE";
export const locales = ["en", "hi"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}

export default getRequestConfig(async () => ({
  locale: defaultLocale,
  messages: (await import("../messages/en.json")).default,
}));
