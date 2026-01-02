// frontend/app/page.tsx
import Header from "@/components/Header";
import FeatureCard from "@/components/FeatureCard";
import HeroIllustration from "@/components/HeroIllustration";
import Button from "@/components/ui/Button";
import Link from "next/link";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#fdfdff]">
      <Header />

      <main className="container py-12">
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
          <div>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#522C5D]/10 border border-[#522C5D]/30 text-[#522C5D] text-sm font-medium mb-6">
              <span className="w-2 h-2 rounded-full bg-[#522C5D] animate-pulse"></span>
              Trusted by 3000+ event organizers
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-extrabold text-[#29104A] leading-tight">
              Events and ticketing — 
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#29104A] to-[#522C5D]"> simplified</span> for campuses and clubs.
            </h1>
            <p className="mt-4 text-[#6B597F] max-w-xl text-lg">
              Create event pages, configure tickets, and manage attendees — all from a lightweight dashboard that's built for organisers.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/signup" className="inline-block">
                <button className="px-8 py-4 bg-gradient-to-r from-[#29104A] to-[#522C5D] text-[#DEDCDC] font-semibold rounded-xl shadow-elegant hover:shadow-glow transition-all duration-300 hover:-translate-y-1">
                  Start Hosting →
                </button>
              </Link>

              <Link href="/fests" className="inline-block">
                <button className="px-8 py-4 bg-[#C5BAC4] border-2 border-[#6B597F] text-[#29104A] font-semibold rounded-xl hover:bg-[#6B597F] hover:text-[#DEDCDC] transition-all duration-300">
                  Discover Events
                </button>
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-6 max-w-md">
              <div className="text-center p-4 rounded-xl bg-[#C5BAC4] border border-[#6B597F]">
                <div className="text-3xl font-bold text-[#29104A]">400+</div>
                <div className="text-sm text-[#522C5D] mt-1">Events hosted</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-[#C5BAC4] border border-[#6B597F]">
                <div className="text-3xl font-bold text-[#29104A]">25k+</div>
                <div className="text-sm text-[#522C5D] mt-1">Tickets sold</div>
              </div>
              <div className="text-center p-4 rounded-xl bg-[#C5BAC4] border border-[#6B597F]">
                <div className="text-3xl font-bold text-[#29104A]">3k+</div>
                <div className="text-sm text-[#522C5D] mt-1">Hosts onboard</div>
              </div>
            </div>
          </div>

          <aside className="order-first lg:order-last lg:scale-105">
            <HeroIllustration />
          </aside>
        </section>

        <section className="mt-20">
          <div className="text-center mb-10">
            <h3 className="text-2xl font-bold text-[#29104A]">Core Features</h3>
            <p className="text-[#6B597F] mt-2">Everything you need to host successful events</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-[#C5BAC4] border border-[#6B597F] hover:shadow-elegant transition-all duration-300 hover:-translate-y-1 group">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#29104A] to-[#522C5D] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-[#DEDCDC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <h4 className="font-bold text-[#29104A] text-lg">Create events</h4>
              <p className="text-[#522C5D] mt-2">Design event pages quickly with schedule, speakers and media.</p>
            </div>
            <div className="p-6 rounded-2xl bg-[#C5BAC4] border border-[#6B597F] hover:shadow-elegant transition-all duration-300 hover:-translate-y-1 group">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#522C5D] to-[#6B597F] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-[#DEDCDC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                </svg>
              </div>
              <h4 className="font-bold text-[#29104A] text-lg">Sell tickets</h4>
              <p className="text-[#522C5D] mt-2">Flexible ticket types, pricing and promo codes.</p>
            </div>
            <div className="p-6 rounded-2xl bg-[#C5BAC4] border border-[#6B597F] hover:shadow-elegant transition-all duration-300 hover:-translate-y-1 group">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6B597F] to-[#522C5D] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-[#DEDCDC]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h4 className="font-bold text-[#29104A] text-lg">Manage attendees</h4>
              <p className="text-[#522C5D] mt-2">Check-in tools, exports, and email notifications.</p>
            </div>
          </div>
        </section>

        <section className="mt-20 bg-gradient-to-r from-[#29104A] to-[#522C5D] p-10 rounded-3xl shadow-elegant">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h4 className="text-2xl font-bold text-[#C5BAC4]">Ready to get started?</h4>
              <p className="text-[#DEDCDC]/80 mt-2">Sign up and create your first event in minutes.</p>
            </div>
            <div className="flex gap-4">
              <Link href="/signup">
                <button className="px-6 py-3 bg-[#C5BAC4] text-[#29104A] font-semibold rounded-xl hover:bg-[#DEDCDC] transition-colors">
                  Start Hosting
                </button>
              </Link>
              <Link href="/fests">
                <button className="px-6 py-3 border-2 border-[#C5BAC4]/50 text-[#C5BAC4] font-semibold rounded-xl hover:bg-[#C5BAC4]/10 transition-colors">
                  Discover
                </button>
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
