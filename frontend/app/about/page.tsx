import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = {
  title: "About · tiqr",
  description: "What tiqr is and who it's for.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <Header />
      <main className="flex-1">
        <div className="container max-w-3xl py-12 md:py-16">
          <h1 className="text-3xl md:text-4xl font-bold text-[#29104A]">About tiqr</h1>
          <p className="mt-4 text-slate-600 leading-relaxed">
            tiqr is an event ticketing and booking platform built for college fests.
            Fest organisers list their events, sell tickets, and manage attendees in
            one place, while students discover fests and book their passes in a few taps.
          </p>

          <h2 className="mt-10 text-xl font-semibold text-[#29104A]">Why we built it</h2>
          <p className="mt-3 text-slate-600 leading-relaxed">
            Running a college fest usually means juggling spreadsheets, payment links,
            and manual guest lists. tiqr replaces that with a single fest-scoped
            dashboard: each fest gets its own admin, its own editors and hosts, and its
            own events and tickets — kept cleanly separate from every other fest.
          </p>

          <h2 className="mt-10 text-xl font-semibold text-[#29104A]">How it works</h2>
          <ul className="mt-3 space-y-2 text-slate-600 leading-relaxed list-disc pl-5">
            <li>Professors request an admin account and get a fest to manage.</li>
            <li>Students join a fest with its fest key and can become editors or hosts.</li>
            <li>Events and ticket types are published for attendees to browse.</li>
            <li>Attendees book tickets and pay securely; confirmations arrive by email.</li>
          </ul>

          <p className="mt-10 text-slate-600">
            Questions or feedback? Reach us at{" "}
            <a href="mailto:support@tiqr.events" className="text-[#522C5D] font-medium underline">
              support@tiqr.events
            </a>
            .
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
