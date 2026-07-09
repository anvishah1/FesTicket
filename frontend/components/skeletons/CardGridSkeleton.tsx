// FE-05: layout-matched placeholder for the card grids. Mirrors card.tsx (h-80
// poster + p-5 content) and the grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 layout
// so there's no content shift when the real data arrives. Purely decorative
// (aria-hidden); the pulse honors prefers-reduced-motion via globals.css.
export default function CardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" aria-hidden="true" data-testid="card-grid-skeleton">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white border border-[#C5BAC4] rounded-xl overflow-hidden flex flex-col">
          <div className="w-full h-80 bg-[#C5BAC4]/30 animate-pulse" />
          <div className="p-5 space-y-2">
            <div className="h-4 w-3/4 rounded bg-[#C5BAC4]/40 animate-pulse" />
            <div className="h-3 w-1/2 rounded bg-[#C5BAC4]/30 animate-pulse" />
            <div className="h-3 w-2/3 rounded bg-[#C5BAC4]/30 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
