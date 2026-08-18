// frontend/components/AuthForm.tsx
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import cx from "clsx";
import { getApiUrl, setAuth } from "@/lib/auth";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function AuthForm() {
  const t = useTranslations("auth");
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

  const canSubmit = email.trim().length > 0 && password.trim().length > 0;

  function redirectByRole(user: { role?: string }) {
    if (user.role === "ADMIN") router.push("/admin/dashboard");
    else if (user.role === "EDITOR" || user.role === "HOST") router.push("/host/dashboard");
    else router.push("/");
  }

  // AUTH-08: second-factor challenge state (set when signin returns twoFactorRequired).
  const [challengeToken, setChallengeToken] = React.useState<string | null>(null);
  const [twoFACode, setTwoFACode] = React.useState("");
  const [useBackup, setUseBackup] = React.useState(false);
  const [twoFABusy, setTwoFABusy] = React.useState(false);

  async function verifyTwoFactor(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeToken || twoFABusy) return;
    setTwoFABusy(true);
    setError(null);
    try {
      const body = useBackup
        ? { challengeToken, backupCode: twoFACode.trim() }
        : { challengeToken, code: twoFACode.trim() };
      const res = await fetch(`${getApiUrl()}/api/auth/2fa/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error?.message || t("errorInvalidCode"));
        setTwoFABusy(false);
        return;
      }
      const { accessToken, refreshToken, user } = data.data;
      setAuth(accessToken, refreshToken, user);
      redirectByRole(user);
    } catch {
      setError(t("errorNetwork"));
    }
    setTwoFABusy(false);
  }

  // AUTH-05: exchange a Google ID token for a session, then role-redirect.
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
        setError(data.error?.message || t("errorGoogleFailed"));
        return;
      }
      // AUTH-08: a 2FA-enabled account gets a challenge instead of a session.
      if (data.data?.twoFactorRequired) {
        setChallengeToken(data.data.challengeToken);
        return;
      }
      const { accessToken, refreshToken, user } = data.data;
      setAuth(accessToken, refreshToken, user);
      redirectByRole(user);
    } catch {
      setError(t("errorNetwork"));
    }
  }

  // AUTH-06: passwordless "email me a sign-in link".
  const [magicBusy, setMagicBusy] = React.useState(false);
  const [magicSent, setMagicSent] = React.useState(false);
  async function requestMagicLink() {
    if (!email.trim() || magicBusy) return;
    setMagicBusy(true);
    setError(null);
    try {
      await fetch(`${getApiUrl()}/api/auth/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      // Always generic (enumeration-safe), regardless of the response.
      setMagicSent(true);
    } catch {
      setError(t("errorNetwork"));
    }
    setMagicBusy(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError(t("errorMissingFields"));
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
        setError(data.error?.message || t("errorInvalidCredentials"));
        setLoading(false);
        return;
      }
      // AUTH-08: 2FA-enabled accounts get a challenge instead of a session.
      if (data.data?.twoFactorRequired) {
        setChallengeToken(data.data.challengeToken);
        setLoading(false);
        return;
      }
      // Unified envelope: tokens + user live under `data`.
      const { accessToken, refreshToken, user } = data.data;
      setAuth(accessToken, refreshToken, user);
      redirectByRole(user);
    } catch {
      setError(t("errorNetwork"));
    }
    setLoading(false);
  }

  // AUTH-08: second-factor step (shown after a correct password on a 2FA account).
  if (challengeToken) {
    return (
      <form onSubmit={verifyTwoFactor} className="space-y-4" data-testid="twofactor-step">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("twoFactorTitle")}</h2>
        <p className="text-sm text-[var(--text-muted)]">
          {useBackup ? t("twoFactorBackupPrompt") : t("twoFactorAppPrompt")}
        </p>
        {error && (
          <div role="alert" className="text-sm text-red-600">
            {error}
          </div>
        )}
        <input
          autoFocus
          value={twoFACode}
          onChange={(e) => setTwoFACode(e.target.value)}
          inputMode={useBackup ? "text" : "numeric"}
          placeholder={useBackup ? "XXXX-XXXX" : "123456"}
          aria-label={t("twoFactorCodeAria")}
          className="w-full border border-[var(--border-mauve)] rounded-lg px-3 py-2 tracking-widest text-center"
        />
        <button
          type="submit"
          disabled={!twoFACode.trim() || twoFABusy}
          className="w-full rounded-lg px-4 py-3 font-medium bg-gradient-to-r from-[#29104A] to-[#522C5D] text-[#DEDCDC] disabled:opacity-50"
        >
          {twoFABusy ? t("verifying") : t("verify")}
        </button>
        <button
          type="button"
          onClick={() => {
            setUseBackup((b) => !b);
            setTwoFACode("");
            setError(null);
          }}
          className="w-full text-sm text-[var(--text-primary)] hover:underline"
          data-testid="toggle-backup"
        >
          {useBackup ? t("useAuthenticatorInstead") : t("useBackupInstead")}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* AUTH-05: real Google sign-in (disabled affordance when unconfigured). */}
      <GoogleSignInButton onCredential={handleGoogleCredential} />

      <div className="flex items-center gap-3">
        <div className="flex-grow border-t border-[var(--border-mauve)]" />
        <div className="text-xs text-[var(--text-muted)]">{t("or")}</div>
        <div className="flex-grow border-t border-[var(--border-mauve)]" />
      </div>

      {error && (
        <div id="auth-form-error" role="alert" className="text-sm text-red-600">
          {error}
          {locked && (
            <div className="mt-1 text-[var(--text-muted)]">
              {t("tryAgainIn")}{" "}
              <span className="font-mono font-semibold" data-testid="lock-countdown">{mmss}</span>. {t("orSentence")}{" "}
              <Link href="/forgot" className="text-[var(--text-primary)] underline">{t("resetPassword")}</Link>{" "}
              {t("toRegainAccess")}
            </div>
          )}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-[var(--text-secondary)]">{t("emailLabel")}</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "auth-form-error" : undefined}
          placeholder={t("emailPlaceholder")}
          className="mt-2 w-full border border-[var(--border-mauve)] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)]"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-[var(--text-secondary)]">{t("passwordLabel")}</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "auth-form-error" : undefined}
          placeholder={t("passwordPlaceholder")}
          className="mt-2 w-full border border-[var(--border-mauve)] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)]"
        />
      </div>

      <div className="flex items-center justify-end text-sm">
        <Link className="text-[var(--text-primary)] hover:underline" href="/forgot">{t("forgotPassword")}</Link>
      </div>

      {captchaSiteKey && (
        <div
          className="cf-turnstile"
          data-sitekey={captchaSiteKey}
          data-callback="__FesTicketCaptchaCb"
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
              : "bg-[color-mix(in_srgb,var(--fill-mauve)_50%,transparent)] text-[#DEDCDC]/70 cursor-not-allowed"
          )}
        >
          {loading ? t("signingIn") : locked ? t("locked", { mmss }) : t("signInWithEmail")}
        </button>
      </div>

      {/* AUTH-06: passwordless sign-in link */}
      <div className="text-center">
        {magicSent ? (
          <p className="text-sm text-green-700" data-testid="magic-sent">
            {t("magicSent")}
          </p>
        ) : (
          <button
            type="button"
            onClick={requestMagicLink}
            disabled={!email.trim() || magicBusy}
            className="text-sm text-[var(--text-primary)] hover:underline disabled:opacity-50"
            data-testid="magic-link-button"
          >
            {magicBusy ? t("sending") : t("magicLinkButton")}
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 mt-6">
        <div className="flex-grow border-t border-[var(--border-mauve)]" />
        <div className="text-xs text-[var(--text-muted)]">{t("or")}</div>
        <div className="flex-grow border-t border-[var(--border-mauve)]" />
      </div>

      {/* Big Sign Up Button */}
      <div className="mt-4">
        <Link
          href="/signup"
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition bg-[var(--fill-mauve)] hover:bg-[var(--fill-plum)] text-[#DEDCDC]"
        >
          {t("createAccount")}
        </Link>
      </div>
    </form>
  );
}
