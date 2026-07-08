"use client";

import { useEffect, useState } from "react";
import { SWRConfig } from "swr";
import CompleteProfileModal from "@/components/CompleteProfileModal";
import Toaster from "@/components/Toaster";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import {
  getApiUrl,
  getAccessToken,
  updateStoredUser,
  apiFetch,
} from "@/lib/auth";

type MeUser = {
  role?: string;
  profileCompleted?: boolean;
};

// Roles for which a completed profile is actually required (they organise/manage
// events). Plain VIEWERs just browsing are never forced to complete a profile —
// that is deferred to the booking / host onboarding flows.
const ROLES_REQUIRING_PROFILE = new Set(["EDITOR", "HOST", "ADMIN"]);

export default function ClientRoot({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<MeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    async function loadUser() {
      const token = getAccessToken();
      // Anonymous visitors have no profile to complete; skip /me entirely so we
      // don't fire a guaranteed-401 on every public page.
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        // apiFetch refreshes an expired access token once before giving up.
        // redirectOnAuthFailure:false keeps a failed refresh from bouncing the
        // user off the page — a failed /me here is non-fatal.
        const res = await apiFetch(
          "/api/user/me",
          {},
          { redirectOnAuthFailure: false }
        );
        if (res.ok) {
          // Unified envelope: the user object is under `data`.
          setUser((await res.json()).data);
        }
      } catch {
        console.error("Failed to load user");
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  const profileRequired =
    !!user &&
    !user.profileCompleted &&
    ROLES_REQUIRING_PROFILE.has(user.role ?? "");

  const showProfileModal = profileRequired && !dismissed;

  return (
    // FE-02: one SWRConfig for the whole app so useApi/useApiMutation hooks share
    // a cache (dedup + stale-while-revalidate across client navigations). A fresh
    // Map provider keeps the cache clearable; no refetch storm on tab focus.
    <SWRConfig value={{ revalidateOnFocus: false, provider: () => new Map() }}>
      <ServiceWorkerRegistrar />
      <Toaster />
      {!loading && (
        <CompleteProfileModal
          open={showProfileModal}
          // Required roles must complete; keep it non-dismissible for them.
          dismissible={false}
          onClose={() => setDismissed(true)}
          onSubmit={async (data) => {
            const token = getAccessToken();
            const res = await fetch(
              `${getApiUrl()}/api/user/complete-profile`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify(data),
              }
            );

            if (!res.ok) {
              // Surface the failure inside the modal (the modal catches this and
              // shows an inline error) instead of blindly reloading — which,
              // combined with a re-shown modal, produced an infinite loop.
              let message = "Could not save your profile. Please try again.";
              try {
                const body = await res.json();
                if (body?.error?.message) message = body.error.message;
              } catch {
                /* non-JSON error body — keep the default message */
              }
              throw new Error(message);
            }

            // Success: update local state so the modal closes without a hard
            // page reload.
            updateStoredUser({ profileCompleted: true });
            setUser((prev) => ({ ...(prev ?? {}), profileCompleted: true }));
          }}
        />
      )}

      {/* Skip-link target (see components/Header.tsx). tabIndex -1 lets the
          "Skip to main content" link move keyboard focus straight to the page. */}
      <div id="main-content" tabIndex={-1}>
        {children}
      </div>
    </SWRConfig>
  );
}
