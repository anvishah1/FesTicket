"use client";

import { useEffect, useRef } from "react";

// AUTH-05: real Google Identity Services button. Gated on
// NEXT_PUBLIC_GOOGLE_CLIENT_ID — when unset it renders the disabled "coming soon"
// affordance so dev/E2E are unaffected. On a successful sign-in it hands the
// Google ID token to `onCredential`, which POSTs it to /api/auth/google.
type GisId = {
  initialize: (cfg: { client_id: string; callback: (r: { credential?: string }) => void }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
};
type GoogleWindow = Window & { google?: { accounts?: { id?: GisId } } };

export default function GoogleSignInButton({ onCredential }: { onCredential: (idToken: string) => void }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const divRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onCredential);

  // Keep the latest callback without re-initializing GIS (avoids accessing a ref
  // during render).
  useEffect(() => {
    cbRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    if (!clientId) return;
    const render = () => {
      const gid = (window as GoogleWindow).google?.accounts?.id;
      if (!gid || !divRef.current) return;
      gid.initialize({
        client_id: clientId,
        callback: (resp) => {
          if (resp.credential) cbRef.current(resp.credential);
        },
      });
      gid.renderButton(divRef.current, { theme: "outline", size: "large", width: 320, text: "continue_with" });
    };

    if ((window as GoogleWindow).google?.accounts?.id) {
      render();
      return;
    }
    let script = document.getElementById("gis-script") as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = "gis-script";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", render);
      document.head.appendChild(script);
    } else {
      script.addEventListener("load", render);
    }
    return () => script?.removeEventListener("load", render);
  }, [clientId]);

  if (!clientId) {
    return (
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-[#6B597F]/50 px-4 py-2.5 opacity-60 cursor-not-allowed"
        data-testid="google-disabled"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden className="inline-block">
          <path fill="#EA4335" d="M12 11v3h6.5c-.3 1.7-1.8 5-6.5 5a7 7 0 1 1 0-14c1.9 0 3.2.8 4.1 1.6l2.8-2.9C18.9 2 15.9 1 12 1 6.5 1 2 5.5 2 11s4.5 10 10 10c5.7 0 9.9-4.1 9.9-9.9 0-.7-.1-1.4-.3-2H12z" />
        </svg>
        <span className="text-sm font-medium">Sign in with Google (coming soon)</span>
      </button>
    );
  }

  return <div ref={divRef} data-testid="google-signin" className="flex justify-center min-h-[40px]" />;
}
