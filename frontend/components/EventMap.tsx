"use client";

// FE-04: the Leaflet map + its CSS live here so `leaflet/dist/leaflet.css` is
// code-split into this chunk (loaded only on the event-detail page that renders a
// map) instead of shipping in the global bundle to every visitor. This module is
// imported via `dynamic(() => import("@/components/EventMap"), { ssr: false })`,
// so react-leaflet/leaflet (which touch `window`) never run on the server.

import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import { getCurrentTheme, THEME_EVENT } from "@/lib/theme";

// Leaflet's default marker icon resolves to image paths that break under the Next
// bundler → the pin renders blank. Serve the marker images from /public/leaflet
// (copied from leaflet/dist/images) so the URLs are stable and deterministic.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});

/** Tracks the app's light/dark theme, updating on a same-tab toggle, a change
 *  in another tab, or a switch in the OS preference (when no explicit choice
 *  is stored). */
function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(() => getCurrentTheme() === "dark");

  useEffect(() => {
    const sync = () => setIsDark(getCurrentTheme() === "dark");
    sync();
    window.addEventListener(THEME_EVENT, sync);
    window.addEventListener("storage", sync);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    media?.addEventListener("change", sync);
    return () => {
      window.removeEventListener(THEME_EVENT, sync);
      window.removeEventListener("storage", sync);
      media?.removeEventListener("change", sync);
    };
  }, []);

  return isDark;
}

export default function EventMap({ lat, lng }: { lat: number; lng: number }) {
  const isDark = useIsDarkMode();

  return (
    // The dark-mode class lives on this plain wrapper div, NOT on MapContainer
    // itself — react-leaflet only applies most props (className included) at
    // the initial L.map() call and doesn't re-sync them on later re-renders,
    // so toggling className on MapContainer directly wouldn't react to a
    // same-tab theme change without a full remount. A CSS descendant selector
    // (.map-dark-tiles .leaflet-tile-pane, in globals.css) doesn't care which
    // ancestor carries the class, so a plain wrapper div — which DOES update
    // normally on every render — sidesteps the issue entirely.
    <div
      className={isDark ? "map-dark-tiles" : undefined}
      style={{ height: "100%", width: "100%" }}
    >
      <MapContainer
        center={[lat, lng]}
        zoom={16}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[lat, lng]} />
      </MapContainer>
    </div>
  );
}
