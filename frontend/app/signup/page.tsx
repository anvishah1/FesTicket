"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [captchaOk, setCaptchaOk] = React.useState(false); // demo checkbox for reCAPTCHA

  // password visibility toggles
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);

  // match check: exact equality and non-empty
  const passwordsMatch = password.length > 0 && password === confirm;

  // The button should only be clickable when all requirements satisfied:
  const canSubmit = email.trim().length > 3 && passwordsMatch && captchaOk && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError("Please complete all fields, matching passwords, and reCAPTCHA.");
      return;
    }
    setLoading(true);

    // TODO: call your backend /api/auth/signup with { email, password }
    await new Promise((r) => setTimeout(r, 900)); // simulate API call
    setLoading(false);
    
    // Redirect to onboarding page to collect mandatory details
    router.push("/host/onboarding");
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#fdfdff]">
      <Header />

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left illustration */}
          <div className="hidden lg:flex flex-col items-center justify-center px-6">
            <img src="/sign-up.png" alt="Signup illustration" className="w-full max-w-lg h-auto rounded-3xl shadow-lg" />

            <h3 className="mt-8 text-2xl font-semibold text-[#29104A] text-center">Protection from scammers!</h3>
            <p className="mt-3 text-center text-[#522C5D] max-w-md">
              Verify your tickets quickly and securely with TiQr Scan — create an account to get started.
            </p>
          </div>

          {/* Right form */}
          <div className="flex items-start justify-center">
            <div className="w-full max-w-md bg-[#29104A] rounded-2xl shadow-md p-8 border border-[#3D1B5C]">
              <h2 className="text-2xl font-bold text-center mb-4 text-white">Sign Up</h2>

              {/* Google placeholder */}
              <button
                type="button"
                onClick={() => {
                  // TODO: Implement Google OAuth
                  router.push("/host/onboarding");
                }}
                className="w-full flex items-center justify-center gap-3 border border-[#6B597F] bg-[#DEDCDC] rounded-lg px-4 py-3 hover:bg-[#6B597F]/20 transition"
              >
                <img src="/google-icon.svg" alt="Google" className="w-5 h-5" />
                <span className="text-sm font-medium text-[#29104A]">Sign Up with Google</span>
              </button>

              <div className="flex items-center gap-3 mt-4">
                <div className="flex-grow border-t border-white/30" />
                <div className="text-xs text-white/70">OR</div>
                <div className="flex-grow border-t border-white/30" />
              </div>

              {error && <div className="mt-4 text-sm text-red-600">{error}</div>}

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/90">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@school.edu"
                    className="mt-2 w-full border border-[#6B597F] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D]"
                  />
                </div>

                {/* Password field with eye toggle */}
                <div>
                    <label className="block text-sm font-medium text-white/90">Password</label>

                    {/* Wrap input + eye in its own relative box */}
                    <div className="relative mt-2">
                        <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full border border-[#6B597F] rounded-lg px-3 py-2 pr-12 focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D]"
                        placeholder="At least 8 characters"
                        />

                        <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-[#6B597F] hover:bg-[#6B597F]/20 rounded"
                        aria-label="Toggle password visibility"
                        >
                        {showPassword ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3-11-7 1.02-2.2 2.56-3.98 4.44-5.29" />
                            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                            </svg>
                        ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M2.46 12C3.9 7.6 7.73 5 12 5c4.27 0 8.1 2.6 9.54 7-1.44 4.4-5.27 7-9.54 7-4.27 0-8.1-2.6-9.54-7z"/>
                            <circle cx="12" cy="12" r="3" strokeWidth="2" />
                            </svg>
                        )}
                        </button>
                    </div>
                </div>

                {/* Confirm password with eye toggle */}
                <div>
                    <label className="block text-sm font-medium text-white/90">Confirm Password</label>

                    {/* Input + Eye Icon Wrapper */}
                    <div className="relative mt-2">
                        <input
                        type={showConfirm ? "text" : "password"}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Confirm password"
                        className="w-full border border-[#6B597F] rounded-lg px-3 py-2 pr-12 focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D]"
                        required
                        />

                        {/* Eye Button */}
                        <button
                        type="button"
                        onClick={() => setShowConfirm((s) => !s)}
                        aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-[#6B597F] hover:bg-[#6B597F]/20 rounded"
                        >
                        {showConfirm ? (
                            // Eye Off
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3-11-7 1.02-2.2 2.56-3.98 4.44-5.29" />
                            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18" />
                            </svg>
                        ) : (
                            // Eye
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M2.46 12C3.9 7.6 7.73 5 12 5c4.27 0 8.1 2.6 9.54 7-1.44 4.4-5.27 7-9.54 7-4.27 0-8.1-2.6-9.54-7z" />
                            <circle cx="12" cy="12" r="3" strokeWidth="2" />
                            </svg>
                        )}
                        </button>
                    </div>
                </div>


                {/* reCAPTCHA placeholder */}
                <div className="mt-2">
                  <div className="border border-[#6B597F] rounded-md p-4 bg-[#DEDCDC] text-[#522C5D] text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={captchaOk}
                        onChange={(e) => setCaptchaOk(e.target.checked)}
                        className="w-5 h-5 accent-[#522C5D]"
                      />
                      <span>I'm not a robot (demo checkbox)</span>
                    </label>
                  </div>
                </div>

                {/* Sign Up button:
                    - turns purple when passwordsMatch === true
                    - otherwise shows disabled grey styling
                */}
                <div>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className={`w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition ${
                      passwordsMatch && captchaOk && !loading
                        ? "bg-gradient-to-r from-[#29104A] to-[#522C5D] text-[#DEDCDC] hover:from-[#522C5D] hover:to-[#6B597F]"
                        : "bg-[#6B597F]/50 text-[#DEDCDC]/70 cursor-not-allowed"
                    }`}
                  >
                    {loading ? "Creating…" : "Sign Up With Email"}
                  </button>
                </div>
              </form>

              <div className="mt-4 text-center text-sm text-white/70">
                <a href="/forgot" className="text-white hover:underline">Forgot Password?</a>
                <div className="mt-2">
                  Already have an account? <a href="/signin" className="text-white hover:underline font-medium">Go to Login</a>
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>

      <Footer />
    </div>
  );
}
