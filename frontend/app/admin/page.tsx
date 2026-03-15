"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, isAuthenticated } from "@/lib/auth";

/**
 * /admin does not open the dashboard directly.
 * - Not signed in → redirect to admin signin
 * - Signed in as ADMIN → redirect to fest-oriented dashboard
 * - Otherwise → redirect to admin signin
 */
export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/admin/signin");
      return;
    }
    const user = getStoredUser();
    if (user?.role === "ADMIN") {
      router.replace("/admin/dashboard");
    } else {
      router.replace("/admin/signin");
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-[#fdfdff] flex items-center justify-center">
      <p className="text-[#6B597F]">Redirecting...</p>
    </div>
  );
}
