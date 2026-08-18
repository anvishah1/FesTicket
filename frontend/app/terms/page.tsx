import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Terms",
  description: "The basic terms for using FesTicket.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <Header />
      <main className="flex-1">
        <div className="container max-w-3xl py-12 md:py-16">
          <h1 className="text-3xl md:text-4xl font-bold text-[var(--text-primary)]">Terms of use</h1>
          <p className="mt-4 text-[var(--text-slate)] leading-relaxed">
            By using FesTicket you agree to the basics below. This is a short, honest summary
            of the rules for using the platform.
          </p>

          <h2 className="mt-10 text-xl font-semibold text-[var(--text-primary)]">Your account</h2>
          <p className="mt-3 text-[var(--text-slate)] leading-relaxed">
            You are responsible for keeping your login secure and for the activity on your
            account. Provide accurate information and use the roles you are granted only
            for their intended fest.
          </p>

          <h2 className="mt-10 text-xl font-semibold text-[var(--text-primary)]">Bookings &amp; payments</h2>
          <p className="mt-3 text-[var(--text-slate)] leading-relaxed">
            Ticket prices shown include the platform fee and applicable taxes at checkout.
            Once a booking is confirmed, refunds and changes are subject to the policy of
            the fest that owns the event. FesTicket facilitates the sale but does not run the
            fest itself.
          </p>

          <h2 className="mt-10 text-xl font-semibold text-[var(--text-primary)]">Acceptable use</h2>
          <p className="mt-3 text-[var(--text-slate)] leading-relaxed">
            Do not misuse the service — no attempting to access other fests&apos; data, no
            fraudulent bookings, and no disrupting the platform for others. We may suspend
            accounts that break these rules.
          </p>

          <p className="mt-10 text-[var(--text-slate)]">
            Questions about these terms? Contact{" "}
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
