import Header from "@/components/Header";
import Footer from "@/components/Footer";

export const metadata = {
  title: "Contact · tiqr",
  description: "How to reach the tiqr team.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <Header />
      <main className="flex-1">
        <div className="container max-w-3xl py-12 md:py-16">
          <h1 className="text-3xl md:text-4xl font-bold text-[#29104A]">Contact us</h1>
          <p className="mt-4 text-slate-600 leading-relaxed">
            Need a hand with a booking, your fest dashboard, or an account issue? We&apos;re
            happy to help.
          </p>

          <div className="mt-8 rounded-2xl bg-white shadow-md p-6">
            <h2 className="text-lg font-semibold text-[#29104A]">Support</h2>
            <p className="mt-2 text-slate-600">
              Email us and we&apos;ll get back to you as soon as we can.
            </p>
            <a
              href="mailto:support@tiqr.events"
              className="mt-4 inline-flex px-5 py-2.5 rounded-lg font-semibold text-white bg-[#522C5D] hover:bg-[#3D1B5C] transition-colors"
            >
              support@tiqr.events
            </a>
          </div>

          <p className="mt-8 text-slate-600 leading-relaxed">
            Running a fest and want an admin account? Start at{" "}
            <a href="/admin/signup" className="text-[#522C5D] font-medium underline">
              admin sign up
            </a>
            . Already have a fest key as a student? Head to{" "}
            <a href="/signup" className="text-[#522C5D] font-medium underline">
              sign up
            </a>
            .
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
