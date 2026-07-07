"use client";

import React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PasswordFields from "@/components/PasswordFields";
import { getPasswordChecks } from "@/lib/password";
import { apiFetch, getStoredUser, updateStoredUser, clearAuth, isAuthenticated } from "@/lib/auth";
import { showToast } from "@/lib/toast";

// AUTH-04: authenticated account hub — profile edit, change password, delete
// account, plus links to sessions (AUTH-02) and organizer upgrade (AUTH-03).
export default function AccountPage() {
  const router = useRouter();
  const [ready, setReady] = React.useState(false);
  const [role, setRole] = React.useState("");

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [organizationName, setOrganizationName] = React.useState("");
  const [profileSaving, setProfileSaving] = React.useState(false);

  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [pwSaving, setPwSaving] = React.useState(false);

  const [accountEmail, setAccountEmail] = React.useState("");
  const [confirmEmail, setConfirmEmail] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/signin");
      return;
    }
    (async () => {
      try {
        const res = await apiFetch("/api/user/me");
        const data = await res.json();
        if (res.ok && data.success) {
          const u = data.data;
          setName(u.name || "");
          setPhone(u.phone || "");
          setOrganizationName(u.organizationName || "");
          setAccountEmail(u.email || "");
          setRole(u.role || "");
        }
      } catch {
        const su = getStoredUser();
        if (su) {
          setAccountEmail(su.email || "");
          setRole(su.role || "");
        }
      }
      setReady(true);
    })();
    // Run once on mount — router is only used for a redirect and must not re-trigger
    // the profile fetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileSaving(true);
    try {
      const res = await apiFetch("/api/user/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, organizationName }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        updateStoredUser({ name: data.data.name });
        showToast("Profile updated", "success");
      } else {
        showToast(data.error?.message || "Could not update profile", "error");
      }
    } catch {
      showToast("Could not update profile", "error");
    }
    setProfileSaving(false);
  }

  const pwValid = getPasswordChecks(newPassword, confirmPassword).valid && currentPassword.length > 0;

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!pwValid) return;
    setPwSaving(true);
    try {
      const res = await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("Password changed. Please sign in again.", "success");
        clearAuth();
        router.push("/signin");
      } else {
        showToast(data.error?.message || "Could not change password", "error");
      }
    } catch {
      showToast("Could not change password", "error");
    }
    setPwSaving(false);
  }

  const canDelete = confirmEmail.trim().toLowerCase() === accountEmail.toLowerCase() && accountEmail.length > 0;

  async function deleteAccount() {
    if (!canDelete) {
      showToast("Type your exact email to confirm", "error");
      return;
    }
    if (!window.confirm("This permanently deletes your account. Continue?")) return;
    setDeleting(true);
    try {
      const res = await apiFetch("/api/user/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail: confirmEmail.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        clearAuth();
        router.push("/");
      } else {
        showToast(data.error?.message || "Could not delete account", "error");
      }
    } catch {
      showToast("Could not delete account", "error");
    }
    setDeleting(false);
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <Header />
        <main className="container py-16 text-center text-slate-500">Loading…</main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Header />
      <main className="container py-10">
        <div className="max-w-2xl mx-auto space-y-8">
          <h1 className="text-2xl font-extrabold">Account settings</h1>

          <div className="flex flex-wrap gap-3">
            <Link href="/account/sessions" className="text-sm px-3 py-1.5 rounded-md border hover:bg-slate-50">
              Active sessions
            </Link>
            {role === "VIEWER" && (
              <Link href="/account/organizer" className="text-sm px-3 py-1.5 rounded-md border hover:bg-slate-50">
                Become an organizer
              </Link>
            )}
          </div>

          {/* Profile */}
          <section className="rounded-lg bg-white border p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">Profile</h2>
            <form onSubmit={saveProfile} className="space-y-4">
              <div>
                <label htmlFor="acc-email" className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input id="acc-email" value={accountEmail} disabled className="w-full px-3 py-2 border rounded-md bg-slate-50 text-slate-500" />
              </div>
              <div>
                <label htmlFor="acc-name" className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                <input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label htmlFor="acc-phone" className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <input id="acc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
              </div>
              <div>
                <label htmlFor="acc-org" className="block text-sm font-medium text-slate-700 mb-1">Organisation</label>
                <input id="acc-org" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} className="w-full px-3 py-2 border rounded-md" />
              </div>
              <button type="submit" disabled={profileSaving} className="px-4 py-2 rounded-md bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold">
                {profileSaving ? "Saving…" : "Save profile"}
              </button>
            </form>
          </section>

          {/* Change password */}
          <section className="rounded-lg bg-white border p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">Change password</h2>
            <form onSubmit={changePassword} className="space-y-4">
              <div>
                <label htmlFor="cur-pw" className="block text-sm font-medium text-slate-700 mb-1">Current password</label>
                <input id="cur-pw" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full px-3 py-2 border rounded-md" autoComplete="current-password" />
              </div>
              <PasswordFields
                password={newPassword}
                confirm={confirmPassword}
                onPasswordChange={setNewPassword}
                onConfirmChange={setConfirmPassword}
                idPrefix="change"
              />
              <p className="text-xs text-slate-500">Changing your password signs you out of all devices.</p>
              <button type="submit" disabled={pwSaving || !pwValid} className="px-4 py-2 rounded-md bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold">
                {pwSaving ? "Updating…" : "Change password"}
              </button>
            </form>
          </section>

          {/* Delete */}
          <section className="rounded-lg bg-white border border-red-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-red-700 mb-2">Delete account</h2>
            <p className="text-sm text-slate-500 mb-4">
              This permanently deletes your account. Type your email{" "}
              <span className="font-mono">{accountEmail}</span> to confirm.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                value={confirmEmail}
                onChange={(e) => setConfirmEmail(e.target.value)}
                placeholder={accountEmail}
                aria-label="Confirm email to delete"
                className="flex-1 px-3 py-2 border rounded-md"
              />
              <button
                type="button"
                onClick={deleteAccount}
                disabled={deleting || !canDelete}
                className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold"
              >
                {deleting ? "Deleting…" : "Delete my account"}
              </button>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
