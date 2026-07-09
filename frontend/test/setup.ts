import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Unmount React trees and reset shared state between tests.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  try {
    window.localStorage.clear();
  } catch {
    /* jsdom always provides localStorage, but guard just in case */
  }
});

// --- Browser API stubs jsdom doesn't implement but Next/React components use ---

if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

if (!("ResizeObserver" in window)) {
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (!("IntersectionObserver" in window)) {
  (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    root = null;
    rootMargin = "";
    thresholds = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
}

if (!window.scrollTo) {
  window.scrollTo = vi.fn();
}

// A safe default fetch mock; individual tests override with vi.mocked(fetch).
if (!globalThis.fetch) {
  globalThis.fetch = vi.fn();
}

// --- FE-12: global next-intl mock so any component using useTranslations works
// without wrapping every render in a provider. Resolves the REAL English strings
// from messages/en.json, so existing assertions on visible copy keep passing. ---
vi.mock("next-intl", async () => {
  const en = (await import("../messages/en.json")).default as Record<string, unknown>;
  const lookup = (fullKey: string): unknown =>
    fullKey.split(".").reduce<unknown>(
      (o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined),
      en
    );
  const format = (str: string, values?: Record<string, unknown>) => {
    if (!values) return str;
    // minimal ICU plural: {name, plural, =1 {…} other {…}} — body may contain
    // one level of nested {…} groups, so match those explicitly.
    str = str.replace(
      /\{(\w+),\s*plural,\s*((?:[^{}]|\{[^{}]*\})*)\}/g,
      (_m, name: string, body: string) => {
        const n = Number(values[name]);
        const one = /=1\s*\{([^}]*)\}/.exec(body);
        const other = /other\s*\{([^}]*)\}/.exec(body);
        const chosen = n === 1 && one ? one[1] : other ? other[1] : "";
        return chosen.replace(/#/g, String(n));
      }
    );
    return str.replace(/\{(\w+)\}/g, (_m, k: string) =>
      values[k] != null ? String(values[k]) : `{${k}}`
    );
  };
  const makeT = (ns?: string) => {
    const t = (key: string, values?: Record<string, unknown>) => {
      const full = ns ? `${ns}.${key}` : key;
      const val = lookup(full);
      return typeof val === "string" ? format(val, values) : full;
    };
    return t;
  };
  return {
    useTranslations: (ns?: string) => makeT(ns),
    useLocale: () => "en",
    useFormatter: () => ({
      dateTime: (d: Date) => new Intl.DateTimeFormat("en-US").format(d),
      number: (n: number) => new Intl.NumberFormat("en-US").format(n),
    }),
    NextIntlClientProvider: ({ children }: { children: unknown }) => children,
  };
});

// --- FE-12: default next/navigation stub so components using useRouter (e.g. the
// Header locale switcher) render in tests. Test files with their own
// vi.mock("next/navigation") still take precedence. ---
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
