// frontend/app/signin/page.tsx
"use client";

import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AuthForm from "@/components/AuthForm";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Header />
      <main className="flex items-start justify-center py-16 px-4">
        <div className="w-full max-w-lg">
          <div className="bg-white/95 backdrop-blur rounded-2xl shadow-soft-lg border p-8">
            <div className="flex flex-col items-center gap-4">
              {/* logo / brand */}
              <div className="w-28 h-28 flex items-center justify-center">
                {/* Replace with your logo SVG if desired */}
                <img src="/logo.png" alt="tiqrdupe logo" className="w-28 h-auto" />
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Sign In</h1>
              <p className="text-sm text-slate-500">Welcome back — sign in to continue managing your events and tickets.</p>
            </div>

            <div className="mt-6">
              <AuthForm />
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-slate-400">
            By continuing you agree to our <a className="underline" href="/privacy">Privacy</a> &amp; <a className="underline" href="/terms">Terms</a>.
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
