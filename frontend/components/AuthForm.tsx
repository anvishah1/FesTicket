// frontend/components/AuthForm.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import cx from "clsx";

function SocialButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-center gap-3 border border-[#6B597F] bg-[#DEDCDC] rounded-lg px-4 py-3 hover:bg-[#6B597F]/20 transition"
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

  const canSubmit = email.trim().length > 0 && password.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError("Please enter email and password.");
      return;
    }
    setLoading(true);

    // TODO: Replace with real auth API call
    await new Promise((r) => setTimeout(r, 900));
    setLoading(false);

    // Redirect to host dashboard after successful sign in
    router.push("/host/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Google sign-in (placeholder) */}
      <SocialButton onClick={() => {
        // TODO: Implement Google OAuth
        router.push("/host/dashboard");
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="inline-block">
          <path fill="#EA4335" d="M12 11v3h6.5c-.3 1.7-1.8 5-6.5 5a7 7 0 1 1 0-14c1.9 0 3.2.8 4.1 1.6l2.8-2.9C18.9 2 15.9 1 12 1 6.5 1 2 5.5 2 11s4.5 10 10 10c5.7 0 9.9-4.1 9.9-9.9 0-.7-.1-1.4-.3-2H12z"/>
        </svg>
        <span className="text-sm font-medium">Sign in with Google</span>
      </SocialButton>

      <div className="flex items-center gap-3">
        <div className="flex-grow border-t border-[#6B597F]" />
        <div className="text-xs text-[#6B597F]">OR</div>
        <div className="flex-grow border-t border-[#6B597F]" />
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-[#522C5D]">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@school.edu"
          className="mt-2 w-full border border-[#6B597F] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#522C5D]/20"
          aria-label="Email"
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
          placeholder="Password"
          className="mt-2 w-full border border-[#6B597F] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#522C5D]/20"
          aria-label="Password"
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 text-[#6B597F]">
          <input type="checkbox" className="w-4 h-4 accent-[#522C5D]" />
          Remember me
        </label>

        <a className="text-[#29104A] hover:underline" href="/forgot">Forgot password?</a>
      </div>

      <div>
        <button
          type="submit"
          disabled={!canSubmit || loading}
          className={cx(
            "w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition",
            canSubmit && !loading
              ? "bg-gradient-to-r from-[#29104A] to-[#522C5D] text-[#DEDCDC] hover:from-[#522C5D] hover:to-[#6B597F]"
              : "bg-[#6B597F]/50 text-[#DEDCDC]/70 cursor-not-allowed"
          )}
        >
          {loading ? "Signing in…" : "Sign In with Email"}
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
        <a
          href="/signup"
          className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium transition bg-[#6B597F] hover:bg-[#522C5D] text-[#DEDCDC]"
        >
          Create a New Account
        </a>
      </div>
    </form>
  );
}
