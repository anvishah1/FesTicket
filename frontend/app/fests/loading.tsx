import Header from "@/components/Header";
import CardGridSkeleton from "@/components/skeletons/CardGridSkeleton";

// FE-05: shown during navigation to /fests before the server data resolves.
export default function Loading() {
  return (
    <div className="min-h-screen bg-[#fdfdff]">
      <Header />
      <main className="py-8 px-4">
        <div className="max-w-6xl mx-auto mb-6">
          <h1 className="text-3xl font-bold text-[#29104A]">Discover Fests</h1>
          <p className="text-[#6B597F] mt-1">Explore the most exciting college festivals across India</p>
        </div>
        <div className="max-w-6xl mx-auto">
          <CardGridSkeleton />
        </div>
      </main>
    </div>
  );
}
