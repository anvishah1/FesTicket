// frontend/components/AuthForm.tsx
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import cx from "clsx";
import { getApiUrl, setAuth } from "@/lib/auth";

function SocialButton({ children }: { children: React.ReactNode; }) {
  // Google OAuth is not implemented yet. Render the button disabled ("Coming
  // soon") rather than routing to a protected/fake page.
  return (
    <button
      type="button"
      disabled
      aria-disabled="true"
      title="Coming soon"
      className="w-full flex items-center justify-center gap-3 border border-[#6B597F] bg-[#DEDCDC] rounded-lg px-4 py-3 opacity-60 cursor-not-allowed"
    >
      {children}
    </button>
  );
}

export default function AuthForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = React.useState("");
  // AUTH-09: when signin returns a lock, drive a live countdown from the server's
  // lockUntil (trusting the server time, not a fixed client start).
  const [lockUntil, setLockUntil] = React.useState<number | null>(null);
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (lockUntil == null) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockUntil]);

  const locked = lockUntil != null && lockUntil > nowMs;
  const remainingSec = locked ? Math.ceil((lockUntil - nowMs) / 1000) : 0;
  const mmss = `${String(Math.floor(remainingSec / 60)).padStart(2, "0")}:${String(remainingSec % 60).padStart(2, "0")}`;

  // CAPTCHA: graceful degradation. When NEXT_PUBLIC_CAPTCHA_SITE_KEY is unset
  // (dev / E2E / tests) we send a placeholder token — the backend accepts any
  // token when CAPTCHA_SECRET is unset. When a site key IS set we render a real
  // Cloudflare Turnstile widget and send the token it produces. Sign-in submit
  // is NOT gated on the captcha (only email + password), matching the E2E flow.
  const captchaSiteKey = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY;

  React.useEffect(() => {
    if (!captchaSiteKey) return;
    const w = window as unknown as { __tiqrCaptchaCb?: (t: string) => void };
    w.__tiqrCaptchaCb = (token: string) => setCaptchaToken(token || "");
    if (!document.getElementById("cf-turnstile-script")) {
      const s = document.createElement("script");
      s.id = "cf-turnstile-script";
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
  }, [captchaSiteKey]);

  const canSubmit = email.trim().length > 0 && password.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError("Please enter email and password.");
      return;
    }
    setLoading(true);

    try {
      const res = await fetch(`${getApiUrl()}/api/auth/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          captchaToken: captchaSiteKey ? captchaToken : "dev",
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // AUTH-09: a lock response carries lockUntil — start the countdown.
        const lu = data.error?.details?.lockUntil;
        if (lu) {
          const t = new Date(lu).getTime();
          if (Number.isFinite(t)) {
            setLockUntil(t);
            setNowMs(Date.now());
          }
        }
        setError(data.error?.message || "Invalid email or password.");
        setLoading(false);
        return;
      }
      // Unified envelope: tokens + user live under `data`.
      const { accessToken, refreshToken, user } = data.data;
      setAuth(accessToken, refreshToken, user);

        if (user.role === "ADMIN") {
          router.push("/admin/dashboard");
        }

        else if (user.role === "EDITOR" || user.role === "HOST") {
          router.push("/host/dashboard");
        }

        else {
          router.push("/");
        }

    } catch {
      setError("Could not reach server. Please try again.");
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Google sign-in — not implemented yet, shown disabled ("Coming soon"). */}
      <SocialButton>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="inline-block">
          <path fill="#EA4335" d="M12 11v3h6.5c-.3 1.7-1.8 5-6.5 5a7 7 0 1 1 0-14c1.9 0 3.2.8 4.1 1.6l2.8-2.9C18.9 2 15.9 1 12 1 6.5 1 2 5.5 2 11s4.5 10 10 10c5.7 0 9.9-4.1 9.9-9.9 0-.7-.1-1.4-.3-2H12z"/>
        </svg>
        <span className="text-sm font-medium">Sign in with Google (coming soon)</span>
      </SocialButton>

      <div className="flex items-center gap-3">
        <div className="flex-grow border-t border-[#6B597F]" />
        <div className="text-xs text-[#6B597F]">OR</div>
        <div className="flex-grow border-t border-[#6B597F]" />
      </div>

      {error && (
        <div id="auth-form-error" role="alert" className="text-sm text-red-600">
          {error}
          {locked && (
            <div className="mt-1 text-[#6B597F]">
              Try again in{" "}
              <span className="font-mono font-semibold" data-testid="lock-countdown">{mmss}</span>. Or{" "}
              <Link href="/forgot" className="text-[#29104A] underline">reset your password</Link>{" "}
              to regain access now.
            </div>
          )}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-[#522C5D]">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "auth-form-error" : undefined}
          placeholder="you@school.edu"
          className="mt-2 w-full border border-[#6B597F] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#522C5D]/20"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-[#522C5D]">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "auth-form-error" : undefined}
          placeholder="Password"
          className="mt-2 w-full border border-[#6B597F] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#522C5D]/20"
        />
      </div>

      <div className="flex items-center justify-end text-sm">
        <Link className="text-[#29104A] hover:underline" href="/forgot">Forgot password?</Link>
      </div>

      {captchaSiteKey && (
        <div
          className="cf-turnstile"
          data-sitekey={captchaSiteKey}
          data-callback="__tiqrCaptchaCb"
        />
      )}

      <div>
        <button
          type="submit"
          disabled={!canSubmit || loading || locked}
          className={cx(
            "w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition",
            canSubmit && !loading && !locked
              ? "bg-gradient-to-r from-[#29104A] to-[#522C5D] text-[#DEDCDC] hover:from-[#522C5D] hover:to-[#6B597F]"
              : "bg-[#6B597F]/50 text-[#DEDCDC]/70 cursor-not-allowed"
          )}
        >
          {loading ? "Signing in…" : locked ? `Locked · ${mmss}` : "Sign In with Email"}
        </button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 mt-6">
        <div className="flex-grow border-t border-[#6B597F]" />
        <div className="text-xs text-[#6B597F]">OR</div>
        <div className="flex-grow border-t border-[#6B597F]" />
      </div>

      {/* Big Sign Up Button */}
      <div className="mt-4">
        <Link
          href="/signup"
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition bg-[#6B597F] hover:bg-[#522C5D] text-[#DEDCDC]"
        >
          Create a New Account
        </Link>
      </div>
    </form>
  );
}
