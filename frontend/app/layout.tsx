"use client";

import "../globals.css";
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import CompleteProfileModal from "@/components/CompleteProfileModal";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        }
      } catch (err) {
        console.error("Failed to load user");
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  const showProfileModal = user && !user.profileCompleted;

  return (
    <html lang="en">
      <body className="antialiased">
        {!loading && (
          <CompleteProfileModal
            open={showProfileModal}
            onSubmit={async (data) => {
              await fetch("/api/user/complete-profile", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
              });

              // reload user state
              window.location.reload();
            }}
          />
        )}

        {children}
      </body>
    </html>
  );
}
