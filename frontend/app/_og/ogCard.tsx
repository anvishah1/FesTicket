/* eslint-disable @typescript-eslint/no-explicit-any */
// frontend/app/_og/ogCard.tsx
//
// SEO-03: shared builder for the 1200x630 OpenGraph share cards rendered by the
// per-event and per-fest opengraph-image routes. Composes a branded card (poster
// background when the image is an absolute, fetchable URL, else the FesTicket gradient)
// and returns a next/og ImageResponse. Fonts are bundled (Poppins TTF, which
// includes the ₹ glyph) and read from the module dir so no external font fetch is
// needed. Every helper is defensive: a font/poster failure degrades, never throws.

import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Metadata-route contract (re-exported by the image routes).
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND_DARK = "#29104A";
const BRAND = "#522C5D";
const ACCENT = "#F4C542";

// --- fonts (read once, resilient) --------------------------------------------
// Read the bundled TTFs from disk. Node's fetch() rejects file:// URLs, so we
// must use fs, not fetch(new URL(...)) — otherwise the read silently fails and
// ImageResponse falls back to a built-in font that lacks the ₹ glyph.
type LoadedFont = { name: string; data: Buffer; weight: 400 | 700; style: "normal" };
let fontsCache: LoadedFont[] | null = null;
function readFont(file: string): Buffer {
  try {
    // The `new URL('./x', import.meta.url)` asset is emitted next to the module
    // (traced into the build); fs accepts a file: URL.
    return readFileSync(new URL(`./${file}`, import.meta.url));
  } catch {
    // Fallback for runtimes where cwd is the app root (dev / `next start`).
    return readFileSync(join(process.cwd(), "app", "_og", file));
  }
}
function loadFonts(): LoadedFont[] {
  if (fontsCache) return fontsCache;
  try {
    fontsCache = [
      { name: "Poppins", data: readFont("Poppins-Regular.ttf"), weight: 400, style: "normal" },
      { name: "Poppins", data: readFont("Poppins-Bold.ttf"), weight: 700, style: "normal" },
    ];
  } catch {
    // Degrade to ImageResponse's default font rather than 500-ing the route.
    fontsCache = [];
  }
  return fontsCache;
}

// Pure/data helpers live in ogHelpers.ts (testable without next/og). Re-export
// them so the opengraph-image routes can keep importing from ogCard.
export { isPublicHttpUrl, fetchPoster, formatDateRange, priceChip } from "./ogHelpers";

// --- card composition --------------------------------------------------------
export type CardProps = {
  eyebrow?: string | null; // small uppercase label (fest name / "EVENT" / "FEST")
  title: string;
  subtitle?: string | null; // date range
  meta?: string | null; // venue / college
  chip?: string | null; // price chip
  poster?: string | null; // data URI (from fetchPoster) or null
};

function Card({ eyebrow, title, subtitle, meta, chip, poster }: CardProps) {
  const safeTitle = (title || "FesTicket").slice(0, 72);
  const overlay = poster
    ? "linear-gradient(180deg, rgba(20,8,40,0.30) 0%, rgba(20,8,40,0.55) 45%, rgba(20,8,40,0.96) 100%)"
    : "linear-gradient(180deg, rgba(41,16,74,0.0) 0%, rgba(20,8,40,0.35) 100%)";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        position: "relative",
        fontFamily: "Poppins",
        color: "#ffffff",
        backgroundColor: BRAND_DARK,
      }}
    >
      {/* background */}
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={poster}
          alt=""
          width={size.width}
          height={size.height}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundImage: `linear-gradient(135deg, ${BRAND_DARK} 0%, ${BRAND} 100%)`,
          }}
        />
      )}
      {/* legibility overlay */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundImage: overlay,
        }}
      />
      {/* content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "64px",
          position: "relative",
        }}
      >
        {/* top: wordmark + eyebrow */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              backgroundColor: "#ffffff",
              color: BRAND_DARK,
              fontSize: 34,
              fontWeight: 700,
              padding: "6px 26px",
              borderRadius: 999,
              letterSpacing: "-1px",
            }}
          >
            FesTicket
          </div>
          {eyebrow ? (
            <div
              style={{
                display: "flex",
                marginLeft: 24,
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: "2px",
                color: "rgba(255,255,255,0.85)",
              }}
            >
              {eyebrow.toUpperCase().slice(0, 40)}
            </div>
          ) : null}
        </div>

        {/* bottom: title + meta + price chip */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 70, fontWeight: 700, lineHeight: 1.05, letterSpacing: "-2px" }}>
            {safeTitle}
          </div>
          {subtitle || meta ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginTop: 22,
                fontSize: 32,
                fontWeight: 400,
                color: "rgba(255,255,255,0.92)",
              }}
            >
              {subtitle ? <div style={{ display: "flex" }}>{subtitle}</div> : null}
              {subtitle && meta ? <div style={{ display: "flex", margin: "0 14px" }}>•</div> : null}
              {meta ? <div style={{ display: "flex" }}>{meta.slice(0, 48)}</div> : null}
            </div>
          ) : null}
          {chip ? (
            <div style={{ display: "flex", marginTop: 30 }}>
              <div
                style={{
                  display: "flex",
                  backgroundColor: ACCENT,
                  color: BRAND_DARK,
                  fontSize: 32,
                  fontWeight: 700,
                  padding: "10px 30px",
                  borderRadius: 999,
                }}
              >
                {chip}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export async function renderCard(props: CardProps): Promise<Response> {
  const fonts = loadFonts();
  const opts = { width: size.width, height: size.height, ...(fonts.length ? { fonts } : {}) };
  const make = (poster: string | null | undefined) => new ImageResponse(<Card {...props} poster={poster} />, opts);

  // next/og renders lazily when the response stream is consumed — AFTER the image
  // route's try/catch has returned. A poster whose bytes pass fetchPoster's cheap
  // checks but can't actually be decoded by satori would then throw mid-stream and
  // 500 the route. When a poster is present, force the render HERE (arrayBuffer)
  // so any decode error is caught, and fall back to the gradient card (no poster).
  if (props.poster) {
    try {
      const buf = await make(props.poster).arrayBuffer();
      return new Response(buf, { headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=3600" } });
    } catch {
      return make(null);
    }
  }
  return make(null);
}
