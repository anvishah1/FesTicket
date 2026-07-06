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
