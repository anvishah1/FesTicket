import Header from "@/components/Header";
import CardGridSkeleton from "@/components/skeletons/CardGridSkeleton";

// FE-05: shown during navigation to a fest's events page before data resolves.
export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--surface-tint)]">
      <Header />
      <main className="py-8 px-4">
        <div className="max-w-6xl mx-auto">
          <CardGridSkeleton />
        </div>
      </main>
    </div>
  );
}
