"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

/**
 * This page previously showed a fake "Request Submitted!" confirmation for
 * editor onboarding without creating anything on the backend. The real editor
 * onboarding is the /signup flow (with the "become an Editor" option + fest
 * key), which actually creates a RoleRequest. We redirect there instead of
 * showing a false confirmation.
 */
export default function HostOnboardingPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/signup");
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface-tint)]">
      <Header />
      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="text-center">
          <p className="text-[var(--text-muted)]">Redirecting you to sign up…</p>
          <a href="/signup" className="mt-3 inline-block text-[var(--text-secondary)] hover:underline font-medium">
            Continue to Sign Up
          </a>
        </div>
      </main>
      <Footer />
    </div>
  );
}
