// frontend/components/analytics/SalesTrendChart.tsx
// ANL-01: theme-aware sales trend chart (revenue over time) drawn as inline SVG —
// no external chart lib. `points` come from the fest timeseries endpoint; revenue
// is INTEGER PAISE. Responsive (scales to its container, never overflows the page)
// and legible in both themes via CSS tokens.
"use client";

import { useMemo, useState } from "react";
import { formatPaise } from "@/lib/format";

export interface TrendPoint {
  date: string; // yyyy-mm-dd
  revenue: number; // paise
  ticketsSold: number;
  bookings: number;
}

const W = 760;
const H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 16 };

function formatDay(iso: string) {
  // Parse as UTC so the label matches the server's tz-bucketed key exactly.
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

export default function SalesTrendChart({ points }: { points: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const n = points.length;
    const maxRev = Math.max(1, ...points.map((p) => p.revenue));
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    const y = (v: number) => PAD.top + innerH - (v / maxRev) * innerH;
    const linePts = points.map((p, i) => `${x(i)},${y(p.revenue)}`);
    const line = linePts.length ? `M${linePts.join(" L")}` : "";
    const area = linePts.length
      ? `M${PAD.left},${PAD.top + innerH} L${linePts.join(" L")} L${x(n - 1)},${PAD.top + innerH} Z`
      : "";
    return { n, maxRev, x, y, line, area, baseY: PAD.top + innerH };
  }, [points]);

  const totals = useMemo(
    () => ({
      revenue: points.reduce((a, p) => a + p.revenue, 0),
      tickets: points.reduce((a, p) => a + p.ticketsSold, 0),
    }),
    [points]
  );

  const active = hover != null && points[hover] ? points[hover] : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    if (geo.n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width; // 0..1 across the SVG
    const svgX = fx * W;
    const frac = Math.min(1, Math.max(0, (svgX - PAD.left) / (W - PAD.left - PAD.right)));
    setHover(geo.n <= 1 ? 0 : Math.round(frac * (geo.n - 1)));
  }

  const gridYs = [0.25, 0.5, 0.75, 1];

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <div>
          <p className="text-xs text-[var(--text-muted)]">
            {active ? formatDay(active.date) : "Total in view"}
          </p>
          <p className="text-xl font-bold text-[var(--text-primary)]">
            {formatPaise(active ? active.revenue : totals.revenue)}
          </p>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          {active
            ? `${active.ticketsSold} ticket${active.ticketsSold === 1 ? "" : "s"} · ${active.bookings} booking${active.bookings === 1 ? "" : "s"}`
            : `${totals.tickets.toLocaleString()} tickets sold`}
        </p>
      </div>

      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Sales trend: ${formatPaise(totals.revenue)} across ${geo.n} ${geo.n === 1 ? "day" : "days"}`}
          className="w-full h-auto"
          preserveAspectRatio="none"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="anl-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--fill-plum)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--fill-plum)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* horizontal gridlines */}
          {gridYs.map((g) => {
            const yy = PAD.top + (H - PAD.top - PAD.bottom) * g;
            return (
              <line
                key={g}
                x1={PAD.left}
                x2={W - PAD.right}
                y1={yy}
                y2={yy}
                stroke="var(--border-card)"
                strokeWidth={1}
                strokeDasharray="3 4"
                opacity={0.6}
              />
            );
          })}

          {geo.area && <path d={geo.area} fill="url(#anl-area)" />}
          {geo.line && (
            <path d={geo.line} fill="none" stroke="var(--fill-plum)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          )}

          {/* hover guide + marker */}
          {active && hover != null && (
            <>
              <line
                x1={geo.x(hover)}
                x2={geo.x(hover)}
                y1={PAD.top}
                y2={geo.baseY}
                stroke="var(--fill-plum)"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                opacity={0.5}
              />
              <circle cx={geo.x(hover)} cy={geo.y(active.revenue)} r={4} fill="var(--fill-plum)" stroke="var(--surface)" strokeWidth={2} />
            </>
          )}
        </svg>
      </div>

      {/* x-axis endpoints */}
      {geo.n > 0 && (
        <div className="flex justify-between text-[11px] text-[var(--text-muted)] mt-1 px-1">
          <span>{formatDay(points[0].date)}</span>
          <span>{formatDay(points[points.length - 1].date)}</span>
        </div>
      )}
    </div>
  );
}
