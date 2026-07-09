"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getApiUrl, setAuth } from "@/lib/auth";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [wantsEditor, setWantsEditor] = React.useState(false);
  const [festKey, setFestKey] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [captchaOk, setCaptchaOk] = React.useState(false); // demo checkbox for reCAPTCHA
  const [captchaToken, setCaptchaToken] = React.useState(""); // real Turnstile token (when configured)
  const [submitted, setSubmitted] = React.useState(false);

  // AUTH-05: Google sign-up/in — exchange the ID token for a session + redirect.
  async function handleGoogleCredential(idToken: string) {
    setError(null);
    try {
      const res = await fetch(`${getApiUrl()}/api/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message || "Google sign-in failed.");
        return;
      }
      // AUTH-08: a 2FA-enabled account can't complete the second factor here
      // (this is the sign-UP page) — send them to sign-in to finish.
      if (data.data?.twoFactorRequired) {
        router.push("/signin");
        return;
      }
      const { accessToken, refreshToken, user } = data.data;
      setAuth(accessToken, refreshToken, user);
      if (user.role === "ADMIN") router.push("/admin/dashboard");
      else if (user.role === "EDITOR" || user.role === "HOST") router.push("/host/dashboard");
      else router.push("/");
    } catch {
      setError("Could not reach server. Please try again.");
    }
  }

  // AUTH-01: the API returns emailVerified:false when verification is enforced.
  const [needsVerification, setNeedsVerification] = React.useState(false);

  // CAPTCHA: graceful degradation. When NEXT_PUBLIC_CAPTCHA_SITE_KEY is unset
  // (dev / E2E / tests) we keep the demo "I'm not a robot" checkbox gating and
  // send a placeholder token — the backend accepts any token when CAPTCHA_SECRET
  // is unset. When a site key IS set, we render a real Cloudflare Turnstile
  // widget and gate on the token it produces.
  const captchaSiteKey = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY;
  const captchaSatisfied = captchaSiteKey ? captchaToken.length > 0 : captchaOk;

  React.useEffect(() => {
    if (!captchaSiteKey) return;
    const w = window as unknown as { __FesTicketCaptchaCb?: (t: string) => void };
    w.__FesTicketCaptchaCb = (token: string) => setCaptchaToken(token || "");
    if (!document.getElementById("cf-turnstile-script")) {
      const s = document.createElement("script");
      s.id = "cf-turnstile-script";
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
  }, [captchaSiteKey]);

  // password visibility toggles
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);

  // match check: exact equality and non-empty
  const passwordsMatch = password.length > 0 && password === confirm;

  // Live password-complexity checks — these mirror the backend authValidator
  // policy exactly (8–30 chars, upper, lower, number, special char) so the
  // client enables submit only for passwords the server will accept.
  const pwHasLength = password.length >= 8 && password.length <= 30;
  const pwHasUpper = /[A-Z]/.test(password);
  const pwHasLower = /[a-z]/.test(password);
  const pwHasNumber = /[0-9]/.test(password);
  const pwHasSpecial = /[^A-Za-z0-9]/.test(password);
  const passwordValid =
    pwHasLength && pwHasUpper && pwHasLower && pwHasNumber && pwHasSpecial;

  const passwordRules = [
    { label: "8–30 characters", ok: pwHasLength },
    { label: "One uppercase letter", ok: pwHasUpper },
    { label: "One lowercase letter", ok: pwHasLower },
    { label: "One number", ok: pwHasNumber },
    { label: "One special character", ok: pwHasSpecial },
    { label: "Passwords match", ok: passwordsMatch },
  ];

  const festKeyValid = !wantsEditor || festKey.trim().length >= 1;

  // The button should only be clickable when all requirements satisfied:
  const canSubmit =
    email.trim().length > 3 &&
    passwordValid &&
    passwordsMatch &&
    captchaSatisfied &&
    festKeyValid &&
    !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError("Please complete all fields correctly (including fest key if requesting editor) and reCAPTCHA.");
      return;
    }
    setLoading(true);

    try {
      const res = await fetch(`${getApiUrl()}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name: fullName || undefined,
          wantsEditor: !!wantsEditor,
          festKey: wantsEditor ? festKey.trim() : undefined,
          captchaToken: captchaSiteKey ? captchaToken : "dev",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Unified envelope: human message at error.message, field-level
        // validation errors at error.details ({ field: msg }).
        const msg =
          data.error?.details
            ? Object.entries(data.error.details)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" ")
            : data.error?.message || "Signup failed. Please try again.";
        setError(msg);
        setLoading(false);
        return;
      }
      setNeedsVerification(data?.data?.emailVerified === false);
      setSubmitted(true);
    } catch {
      setError("Could not reach server. Please try again.");
    }
    setLoading(false);
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-[var(--surface-tint)]">
        <Header />
        <main className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-md">
            <div className="bg-[var(--surface)] rounded-2xl shadow-lg border border-[var(--border-card)] p-8 text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
                {needsVerification ? "Verify your email" : wantsEditor ? "Request Submitted!" : "Account Created"}
              </h2>
              <p className="text-[var(--text-muted)] mb-6">
                {needsVerification
                  ? "We've sent a verification link to your email. Click it to activate your account, then sign in." +
                    (wantsEditor
                      ? " Your request for organizer access is pending admin approval."
                      : "")
                  : wantsEditor
                  ? "Your account has been created and you can sign in now as a viewer. Your request for organizer access is pending admin approval — your role will be upgraded automatically once it's approved."
                  : "You can now sign in with your email and password."}
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => router.push("/signin")}
                  className="w-full py-3 bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white font-semibold rounded-xl hover:opacity-90 transition"
                >
                  Go to Sign In
                </button>
                <button
                  onClick={() => router.push("/")}
                  className="w-full py-3 border border-[var(--border-card)] text-[var(--text-muted)] font-medium rounded-xl hover:bg-[color-mix(in_srgb,var(--surface-card)_20%,transparent)] transition"
                >
                  Back to Home
                </button>
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--surface-tint)]">
      <Header />

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left illustration */}
          <div className="hidden lg:flex flex-col items-center justify-center px-6">
            <img src="/sign-up.png" alt="Signup illustration" className="w-full max-w-lg h-auto rounded-3xl shadow-lg" />

            <h3 className="mt-8 text-2xl font-semibold text-[var(--text-primary)] text-center">Protection from scammers!</h3>
            <p className="mt-3 text-center text-[var(--text-secondary)] max-w-md">
              Verify your tickets quickly and securely with FesTicket Scan — create an account to get started.
            </p>
          </div>

          {/* Right form */}
          <div className="flex items-start justify-center">
            <div className="w-full max-w-md bg-[var(--fill-ink)] rounded-2xl shadow-md p-8 border border-[#3D1B5C]">
              <h2 className="text-2xl font-bold text-center mb-4 text-white">Sign Up</h2>

              {/* AUTH-05: real Google sign-up (disabled affordance when unconfigured). */}
              <GoogleSignInButton onCredential={handleGoogleCredential} />

              <div className="flex items-center gap-3 mt-4">
                <div className="flex-grow border-t border-white/30" />
                <div className="text-xs text-white/70">OR</div>
                <div className="flex-grow border-t border-white/30" />
              </div>

              {error && (
                <div id="signup-error" role="alert" className="mt-4 text-sm text-red-600">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                <div>
                  <label htmlFor="signup-fullname" className="block text-sm font-medium text-white/90">Full Name (optional)</label>
                  <input
                    id="signup-fullname"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name"
                    className="mt-2 w-full border border-[var(--border-mauve)] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:border-[var(--border-plum)]"
                  />
                </div>

                <div>
                  <label htmlFor="signup-email" className="block text-sm font-medium text-white/90">Email</label>
                  <input
                    id="signup-email"
                    type="email"
                    required
                    aria-required="true"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? "signup-error" : undefined}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@school.edu"
                    className="mt-2 w-full border border-[var(--border-mauve)] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:border-[var(--border-plum)]"
                  />
                </div>

                {/* Password field with eye toggle */}
                <div>
                    <label htmlFor="signup-password" className="block text-sm font-medium text-white/90">Password</label>

                    {/* Wrap input + eye in its own relative box */}
                    <div className="relative mt-2">
                        <input
                        id="signup-password"
                        type={showPassword ? "text" : "password"}
                        required
                        aria-required="true"
                        aria-describedby="signup-password-rules"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full border border-[var(--border-mauve)] rounded-lg px-3 py-2 pr-12 focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:border-[var(--border-plum)]"
                        placeholder="At least 8 characters"
                        />

                        <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--fill-mauve)_20%,transparent)] rounded"
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
                    <label htmlFor="signup-confirm" className="block text-sm font-medium text-white/90">Confirm Password</label>

                    {/* Input + Eye Icon Wrapper */}
                    <div className="relative mt-2">
                        <input
                        id="signup-confirm"
                        type={showConfirm ? "text" : "password"}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Confirm password"
                        className="w-full border border-[var(--border-mauve)] rounded-lg px-3 py-2 pr-12 focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:border-[var(--border-plum)]"
                        required
                        aria-required="true"
                        aria-invalid={confirm.length > 0 && !passwordsMatch ? true : undefined}
                        />

                        {/* Eye Button */}
                        <button
                        type="button"
                        onClick={() => setShowConfirm((s) => !s)}
                        aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--fill-mauve)_20%,transparent)] rounded"
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

                {/* Live password requirements checklist. Each rule flips to a
                    satisfied (green) state as the user types, so the full policy
                    is visible up-front instead of being discovered one error at
                    a time after submit. */}
                <ul id="signup-password-rules" className="space-y-1 text-xs" aria-label="Password requirements">
                  {passwordRules.map((rule) => (
                    <li
                      key={rule.label}
                      data-testid={`pw-rule-${rule.ok ? "ok" : "todo"}`}
                      className={`flex items-center gap-2 ${
                        rule.ok ? "text-green-400" : "text-white/60"
                      }`}
                    >
                      <span aria-hidden className="inline-flex w-4 justify-center">
                        {rule.ok ? "✓" : "○"}
                      </span>
                      <span>{rule.label}</span>
                    </li>
                  ))}
                </ul>


                {/* Editor request toggle */}
                <div className="mt-2">
                  <label className="flex items-start gap-3 text-sm text-white/90">
                    <input
                      type="checkbox"
                      checked={wantsEditor}
                      onChange={(e) => setWantsEditor(e.target.checked)}
                      className="mt-1 w-4 h-4 accent-[var(--surface-page)]"
                    />
                    <span>
                      I want to become an <span className="font-semibold">Editor (student fest head)</span> for a specific fest.
                    </span>
                  </label>
                </div>

                {wantsEditor && (
                  <div>
                    <label htmlFor="signup-festkey" className="block text-sm font-medium text-white/90 mt-2">
                      Fest key <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="signup-festkey"
                      type="text"
                      required
                      aria-required="true"
                      value={festKey}
                      onChange={(e) => setFestKey(e.target.value)}
                      placeholder="Enter the key provided by your fest admin"
                      aria-describedby="signup-festkey-hint"
                      className="mt-2 w-full border border-[var(--border-mauve)] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:border-[var(--border-plum)]"
                    />
                    <p id="signup-festkey-hint" className="text-xs text-white/70 mt-1">
                      Get this key from your fest admin (professor) after they are approved.
                    </p>
                  </div>
                )}

                {/* CAPTCHA: real Turnstile widget when configured, else demo checkbox */}
                <div className="mt-2">
                  {captchaSiteKey ? (
                    <div
                      className="cf-turnstile"
                      data-sitekey={captchaSiteKey}
                      data-callback="__FesTicketCaptchaCb"
                    />
                  ) : (
                    <div className="border border-[var(--border-mauve)] rounded-md p-4 bg-[var(--surface-page)] text-[var(--text-secondary)] text-sm">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={captchaOk}
                          onChange={(e) => setCaptchaOk(e.target.checked)}
                          className="w-5 h-5 accent-[var(--fill-plum)]"
                        />
                        <span>I'm not a robot (demo checkbox)</span>
                      </label>
                    </div>
                  )}
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
                      canSubmit
                        ? "bg-gradient-to-r from-[#29104A] to-[#522C5D] text-[#DEDCDC] hover:from-[#522C5D] hover:to-[#6B597F]"
                        : "bg-[color-mix(in_srgb,var(--fill-mauve)_50%,transparent)] text-[#DEDCDC]/70 cursor-not-allowed"
                    }`}
                  >
                    {loading ? "Creating…" : "Sign Up With Email"}
                  </button>
                </div>
              </form>

              <div className="mt-4 text-center text-sm text-white/70">
                <Link href="/forgot" className="text-white hover:underline">Forgot Password?</Link>
                <div className="mt-2">
                  Already have an account? <Link href="/signin" className="text-white hover:underline font-medium">Go to Login</Link>
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
