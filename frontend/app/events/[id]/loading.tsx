import Header from "@/components/Header";
import EventDetailSkeleton from "@/components/skeletons/EventDetailSkeleton";

// FE-05: shown during navigation to an event detail page before data resolves.
export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--surface-tint)]">
      <Header />
      <EventDetailSkeleton />
    </div>
  );
}
