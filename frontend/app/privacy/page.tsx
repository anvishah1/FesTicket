import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Privacy · tiqr",
  description: "A plain-language summary of how tiqr handles your data.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <Header />
      <main className="flex-1">
        <div className="container max-w-3xl py-12 md:py-16">
          <h1 className="text-3xl md:text-4xl font-bold text-[#29104A]">Privacy</h1>
          <p className="mt-4 text-slate-600 leading-relaxed">
            This is a plain-language summary of how tiqr handles your information. It is
            not a substitute for legal advice, but it reflects how the product works today.
          </p>

          <h2 className="mt-10 text-xl font-semibold text-[#29104A]">What we collect</h2>
          <ul className="mt-3 space-y-2 text-slate-600 leading-relaxed list-disc pl-5">
            <li>Account details you provide: your name, email, and role.</li>
            <li>Booking details: the events you book and the attendees you register.</li>
            <li>Payment records needed to confirm a purchase. Card details are handled by our payment provider, not stored by tiqr.</li>
          </ul>

          <h2 className="mt-10 text-xl font-semibold text-[#29104A]">How we use it</h2>
          <p className="mt-3 text-slate-600 leading-relaxed">
            We use your data to run your account, process bookings, send confirmation
            emails, and show fest organisers who is attending their events. Your data is
            scoped to the fest you belong to — organisers of one fest cannot see another
            fest&apos;s attendees.
          </p>

          <h2 className="mt-10 text-xl font-semibold text-[#29104A]">Your choices</h2>
          <p className="mt-3 text-slate-600 leading-relaxed">
            You can request a copy of your data or ask us to delete your account by
            emailing{" "}
            <a href="mailto:support@tiqr.events" className="text-[#522C5D] font-medium underline">
              support@tiqr.events
            </a>
            . We keep records only for as long as needed to run the service and meet
            legal obligations.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
