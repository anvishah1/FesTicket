// frontend/app/page.tsx
import Header from "@/components/Header";
import FeatureCard from "@/components/FeatureCard";
import HeroIllustration from "@/components/HeroIllustration";
import Button from "@/components/ui/Button";
import Link from "next/link";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen">
      <Header />

      <main className="container py-12">
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 leading-tight">
              Events and ticketing — simplified for campuses and clubs.
            </h1>
            <p className="mt-4 text-slate-600 max-w-xl">
              Create event pages, configure tickets, and manage attendees — all from a lightweight dashboard that’s built for organisers.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/signup" className="inline-block">
                <Button>Start Hosting</Button>
              </Link>

              <Link href="/discover" className="inline-block">
                <Button variant="outline">Discover Events →</Button>
              </Link>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-4 max-w-md">
              <div className="text-center">
                <div className="text-2xl font-semibold">400+</div>
                <div className="text-sm text-slate-500">Events hosted</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-semibold">25k+</div>
                <div className="text-sm text-slate-500">Tickets sold</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-semibold">3k+</div>
                <div className="text-sm text-slate-500">Hosts onboard</div>
              </div>
            </div>
          </div>

          <aside className="order-first lg:order-last">
            <div className="bg-white rounded-lg shadow-soft-lg p-6">
              <HeroIllustration />
            </div>
          </aside>
        </section>

        <section className="mt-12">
          <h3 className="text-xl font-semibold mb-6">Core features</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <FeatureCard title="Create events" body="Design event pages quickly with schedule, speakers and media." />
            <FeatureCard title="Sell tickets" body="Flexible ticket types, pricing and promo codes." />
            <FeatureCard title="Manage attendees" body="Check-in tools, exports, and email notifications." />
          </div>
        </section>

        <section className="mt-12 bg-gradient-to-r from-primary-50/60 to-white p-6 rounded-lg border">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h4 className="font-semibold">Ready to get started?</h4>
              <p className="text-sm text-slate-600">Sign up and create your first event in minutes.</p>
            </div>
            <div className="flex gap-3">
              <Link href="/signup"><Button>Start Hosting</Button></Link>
              <Link href="/discover"><Button variant="ghost">Discover</Button></Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
