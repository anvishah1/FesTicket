"use client";

import { useEffect } from "react";

// TIX-08: registers the offline service worker (/sw.js).
//
// Guarded to the client + production. In dev, Next/Turbopack does its own HMR
// and a service worker intercepting requests causes stale-chunk churn, so we
// deliberately skip registration (and tear down any stale SW) when not in prod.
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Ensure a previously-installed SW from a prod build doesn't hijack dev.
      navigator.serviceWorker.getRegistrations?.().then((regs) => {
        regs.forEach((r) => r.unregister());
      });
      return;
    }

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // When a new SW is found and finishes installing while an old one is
          // controlling the page, ask it to take over so updates aren't stuck a
          // navigation behind.
          reg.addEventListener("updatefound", () => {
            const installing = reg.installing;
            if (!installing) return;
            installing.addEventListener("statechange", () => {
              if (installing.state === "installed" && navigator.serviceWorker.controller) {
                installing.postMessage?.("SKIP_WAITING");
              }
            });
          });
        })
        .catch(() => {
          /* registration is best-effort; the app works fine without it */
        });
    };

    // Register after load so it never competes with first paint / hydration.
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
