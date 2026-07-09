// FE-05: layout-matched placeholder for the event-detail page. Mirrors the 2fr/1fr
// content + ticket-aside layout so there's no shift when the event loads. Purely
// decorative (aria-hidden); the pulse honors prefers-reduced-motion via globals.css.
export default function EventDetailSkeleton() {
  return (
    <div
      className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6"
      aria-hidden="true"
      data-testid="event-detail-skeleton"
    >
      {/* Main content */}
      <div className="space-y-4">
        <div className="h-64 w-full rounded-2xl bg-[color-mix(in_srgb,var(--surface-card)_30%,transparent)] animate-pulse" />
        <div className="h-7 w-2/3 rounded bg-[color-mix(in_srgb,var(--surface-card)_40%,transparent)] animate-pulse" />
        <div className="h-4 w-1/3 rounded bg-[color-mix(in_srgb,var(--surface-card)_30%,transparent)] animate-pulse" />
        <div className="h-24 w-full rounded-xl bg-[color-mix(in_srgb,var(--surface-card)_20%,transparent)] animate-pulse" />
        <div className="h-40 w-full rounded-xl bg-[color-mix(in_srgb,var(--surface-card)_20%,transparent)] animate-pulse" />
      </div>

      {/* Ticket aside */}
      <div className="rounded-2xl border border-[var(--border-card)] p-6 space-y-3 h-fit">
        <div className="h-5 w-1/2 rounded bg-[color-mix(in_srgb,var(--surface-card)_40%,transparent)] animate-pulse" />
        <div className="h-16 w-full rounded-lg bg-[color-mix(in_srgb,var(--surface-card)_20%,transparent)] animate-pulse" />
        <div className="h-11 w-full rounded-lg bg-[color-mix(in_srgb,var(--fill-plum)_20%,transparent)] animate-pulse" />
      </div>
    </div>
  );
}
