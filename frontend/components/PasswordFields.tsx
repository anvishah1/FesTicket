"use client";

import React from "react";
import { getPasswordChecks } from "@/lib/password";

// AUTH-07: reusable new-password + confirm inputs with show/hide toggles and a
// live rules checklist. Used by the reset page and the account change-password
// form (AUTH-04). Purely controlled — the parent owns the values and gates its
// own submit on getPasswordChecks(password, confirm).valid.
export default function PasswordFields({
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  newLabel = "New password",
  confirmLabel = "Confirm password",
  idPrefix = "pw",
}: {
  password: string;
  confirm: string;
  onPasswordChange: (v: string) => void;
  onConfirmChange: (v: string) => void;
  newLabel?: string;
  confirmLabel?: string;
  idPrefix?: string;
}) {
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const checks = getPasswordChecks(password, confirm);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-new`} className="block text-sm font-medium text-slate-700 mb-1">
          {newLabel}
        </label>
        <div className="relative">
          <input
            id={`${idPrefix}-new`}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            className="w-full px-3 py-2 pr-16 border rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 px-3 text-sm text-slate-500 hover:text-slate-700"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-confirm`} className="block text-sm font-medium text-slate-700 mb-1">
          {confirmLabel}
        </label>
        <div className="relative">
          <input
            id={`${idPrefix}-confirm`}
            type={showConfirm ? "text" : "password"}
            value={confirm}
            onChange={(e) => onConfirmChange(e.target.value)}
            aria-invalid={confirm.length > 0 && !checks.passwordsMatch ? true : undefined}
            className="w-full px-3 py-2 pr-16 border rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            autoComplete="new-password"
          />
          <button
            type="button"
            onClick={() => setShowConfirm((s) => !s)}
            aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
            className="absolute inset-y-0 right-0 px-3 text-sm text-slate-500 hover:text-slate-700"
          >
            {showConfirm ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <ul className="space-y-1" aria-label="Password requirements">
        {checks.rules.map((rule) => (
          <li
            key={rule.label}
            className={`flex items-center gap-2 text-sm ${rule.ok ? "text-green-700" : "text-slate-500"}`}
          >
            <span aria-hidden="true">{rule.ok ? "✓" : "○"}</span>
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
