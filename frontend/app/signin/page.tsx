// frontend/app/signin/page.tsx
"use client";

import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AuthForm from "@/components/AuthForm";

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-[#DEDCDC]">
      <Header />
      <main className="flex items-start justify-center py-16 px-4">
        <div className="w-full max-w-lg">
          <div className="bg-[#C5BAC4] rounded-2xl shadow-soft-lg border border-[#6B597F] p-8">
            <div className="flex flex-col items-center gap-4">
              {/* logo / brand */}
              <div className="w-28 h-28 flex items-center justify-center">
                {/* Replace with your logo SVG if desired */}
                <img src="/logo.png" alt="tiqrdupe logo" className="w-28 h-auto" />
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#29104A]">Sign In</h1>
              <p className="text-sm text-[#522C5D]">Welcome back — sign in to continue managing your events and tickets.</p>
            </div>

            <div className="mt-6">
              <AuthForm />
            </div>
          </div>

          <div className="mt-6 text-center text-xs text-[#6B597F]">
            By continuing you agree to our <a className="underline text-[#29104A]" href="/privacy">Privacy</a> &amp; <a className="underline text-[#29104A]" href="/terms">Terms</a>.
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
