"use client";

// FE-04: the Leaflet map + its CSS live here so `leaflet/dist/leaflet.css` is
// code-split into this chunk (loaded only on the event-detail page that renders a
// map) instead of shipping in the global bundle to every visitor. This module is
// imported via `dynamic(() => import("@/components/EventMap"), { ssr: false })`,
// so react-leaflet/leaflet (which touch `window`) never run on the server.

import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";

// Leaflet's default marker icon resolves to image paths that break under the Next
// bundler → the pin renders blank. Serve the marker images from /public/leaflet
// (copied from leaflet/dist/images) so the URLs are stable and deterministic.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});

export default function EventMap({ lat, lng }: { lat: number; lng: number }) {
  return (
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
  );
}
