"use client";

import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function SignUpPage() {
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
    await new Promise((r) => setTimeout(r, 900)); // simulate
    setLoading(false);
    alert("Mock: account created — replace with real backend flow.");
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <Header />

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left illustration (kept as before) */}
          <div className="hidden lg:flex flex-col items-center justify-center px-6">
            <div className="bg-white rounded-full p-8 shadow-sm">
              <img src="/signup-illustration.png" alt="Signup illustration" className="w-80 h-80 object-contain" />
            </div>

            <h3 className="mt-8 text-2xl font-semibold text-slate-900 text-center">Protection from scammers!</h3>
            <p className="mt-3 text-center text-slate-600 max-w-md">
              Verify your tickets quickly and securely with TiQr Scan — create an account to get started.
            </p>
          </div>

          {/* Right form */}
          <div className="flex items-start justify-center">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-md p-8">
              <h2 className="text-2xl font-bold text-center mb-4">Sign Up</h2>

              {/* Google placeholder */}
              <button
                type="button"
                onClick={() => alert("Mock: Google sign-up (replace)")}
                className="w-full flex items-center justify-center gap-3 border rounded-lg px-4 py-3 hover:bg-slate-50 transition"
              >
                <img src="/google-icon.svg" alt="Google" className="w-5 h-5" />
                <span className="text-sm font-medium">Sign Up with Google</span>
              </button>

              <div className="flex items-center gap-3 mt-4">
                <div className="flex-grow border-t" />
                <div className="text-xs text-slate-400">OR</div>
                <div className="flex-grow border-t" />
              </div>

              {error && <div className="mt-4 text-sm text-red-600">{error}</div>}

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@school.edu"
                    className="mt-2 w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary-200"
                  />
                </div>

                {/* Password field with eye toggle */}
                <div>
                    <label className="block text-sm font-medium text-slate-700">Password</label>

                    {/* Wrap input + eye in its own relative box */}
                    <div className="relative mt-2">
                        <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 pr-12 focus:ring-2 focus:ring-primary-200"
                        placeholder="At least 8 characters"
                        />

                        <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded"
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
                    <label className="block text-sm font-medium text-slate-700">Confirm Password</label>

                    {/* Input + Eye Icon Wrapper */}
                    <div className="relative mt-2">
                        <input
                        type={showConfirm ? "text" : "password"}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Confirm password"
                        className="w-full border rounded-lg px-3 py-2 pr-12 focus:ring-2 focus:ring-primary-200"
                        required
                        />

                        {/* Eye Button */}
                        <button
                        type="button"
                        onClick={() => setShowConfirm((s) => !s)}
                        aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded"
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
                  <div className="border rounded-md p-4 bg-slate-50 text-slate-600 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={captchaOk}
                        onChange={(e) => setCaptchaOk(e.target.checked)}
                        className="w-5 h-5"
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
                        ? "bg-purple-600 text-white hover:bg-purple-700"
                        : "bg-slate-300 text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    {loading ? "Creating…" : "Sign Up With Email"}
                  </button>
                </div>
              </form>

              <div className="mt-4 text-center text-sm text-slate-600">
                <a href="/forgot" className="text-primary-600 hover:underline">Forgot Password?</a>
                <div className="mt-2">
                  Already have an account? <a href="/signin" className="text-primary-600 hover:underline">Go to Login</a>
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
