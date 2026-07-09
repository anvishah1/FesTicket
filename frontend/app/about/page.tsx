import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = {
  title: "About · FesTicket",
  description: "What FesTicket is and who it's for.",
};

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <Header />
      <main className="flex-1">
        <div className="container max-w-3xl py-12 md:py-16">
          <h1 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)]">About FesTicket</h1>
          <p className="mt-4 text-[var(--text-slate)] leading-relaxed">
            FesTicket is an event ticketing and booking platform built for college fests.
            Fest organisers list their events, sell tickets, and manage attendees in
            one place, while students discover fests and book their passes in a few taps.
          </p>

          <h2 className="mt-10 text-xl font-semibold text-[var(--text-primary)]">Why we built it</h2>
          <p className="mt-3 text-[var(--text-slate)] leading-relaxed">
            Running a college fest usually means juggling spreadsheets, payment links,
            and manual guest lists. FesTicket replaces that with a single fest-scoped
            dashboard: each fest gets its own admin, its own editors and hosts, and its
            own events and tickets — kept cleanly separate from every other fest.
          </p>

          <h2 className="mt-10 text-xl font-semibold text-[var(--text-primary)]">How it works</h2>
          <ul className="mt-3 space-y-2 text-[var(--text-slate)] leading-relaxed list-disc pl-5">
            <li>Professors request an admin account and get a fest to manage.</li>
            <li>Students join a fest with its fest key and can become editors or hosts.</li>
            <li>Events and ticket types are published for attendees to browse.</li>
            <li>Attendees book tickets and pay securely; confirmations arrive by email.</li>
          </ul>

          <p className="mt-10 text-[var(--text-slate)]">
            Questions or feedback? Reach us at{" "}
            <a href="mailto:support@FesTicket.events" className="text-[var(--text-secondary)] font-medium underline">
              support@FesTicket.events
            </a>
            .
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
