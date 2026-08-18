// frontend/app/signin/page.tsx
"use client";

import { useTranslations } from "next-intl";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AuthForm from "@/components/AuthForm";

export default function SignInPage() {
  const t = useTranslations("signin");
  return (
    <div className="min-h-screen bg-[var(--surface-page)]">
      <Header />
      <main className="flex items-start justify-center py-16 px-4">
        <div className="w-full max-w-lg">
          <div className="bg-[var(--surface-card)] rounded-2xl shadow-soft-lg border border-[var(--border-mauve)] p-8">
            <div className="flex flex-col items-center gap-4">
              {/* logo / brand */}
              <div className="w-28 h-28 flex items-center justify-center">
                <span className="text-5xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  FesTicket
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)]">{t("heading")}</h1>
              <p className="text-sm text-[var(--text-secondary)]">{t("subtitle")}</p>
            </div>

            <div className="mt-6">
              <AuthForm />
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-[var(--text-muted)]">
            {t("termsPrefix")} <a className="underline text-[var(--text-primary)]" href="/privacy">{t("privacy")}</a> &amp; <a className="underline text-[var(--text-primary)]" href="/terms">{t("terms")}</a>.
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
