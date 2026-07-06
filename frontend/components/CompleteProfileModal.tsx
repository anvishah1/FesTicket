"use client";

import { useEffect, useId, useRef, useState } from "react";

interface Props {
  open: boolean;
  onSubmit: (data: {
    firstName: string;
    lastName: string;
    organiserName: string;
    phone: string;
  }) => Promise<void>;
  /** When true the modal can be dismissed (Escape / close button / backdrop). */
  dismissible?: boolean;
  /** Called when the user dismisses the modal (only relevant when dismissible). */
  onClose?: () => void;
}

export default function CompleteProfileModal({
  open,
  onSubmit,
  dismissible = false,
  onClose,
}: Props) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    organiserName: "",
    phone: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  const allFilled =
    form.firstName &&
    form.lastName &&
    form.organiserName &&
    form.phone.length >= 10;

  function requestClose() {
    if (dismissible) onClose?.();
  }

  // Focus management: remember the previously focused element, move focus into
  // the dialog when it opens, and restore focus when it closes.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;
    firstFieldRef.current?.focus();
    const restore = previouslyFocused.current as HTMLElement | null;
    return () => {
      restore?.focus?.();
    };
  }, [open]);

  // Escape to close (only when dismissible) + a simple Tab focus trap.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (dismissible) {
          e.preventDefault();
          requestClose();
        }
        return;
      }
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dismissible]);

  if (!open) return null;

  async function handleSubmit() {
    if (!allFilled) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(form);
      // On success the parent closes the modal by updating its own state; we do
      // not reload the page. Just drop the pending state here.
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="complete-profile-title"
        className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2
            id="complete-profile-title"
            className="text-lg font-semibold"
            style={{ color: "#522C5D" }}
          >
            Basic Profile
          </h2>
          {dismissible && (
            <button
              type="button"
              aria-label="Close"
              onClick={requestClose}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            >
              &times;
            </button>
          )}
        </div>

        {/* Info alert */}
        <div className="px-6 py-4">
          <div className="flex items-center gap-3 bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">
            <span className="w-6 h-6 flex items-center justify-center bg-red-600 text-white rounded-full font-bold">
              i
            </span>
            Please fill in your basic profile details to continue.
          </div>
        </div>

        {/* Form */}
        <div className="px-6 pb-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="First Name"
            required
            value={form.firstName}
            onChange={(v) => setForm({ ...form, firstName: v })}
            inputRef={firstFieldRef}
          />
          <Input
            label="Last Name"
            required
            value={form.lastName}
            onChange={(v) => setForm({ ...form, lastName: v })}
          />
          <Input
            label="Organiser Name"
            required
            placeholder="Displayed as Event Organiser"
            value={form.organiserName}
            onChange={(v) => setForm({ ...form, organiserName: v })}
          />
          <Input
            label="Phone Number"
            required
            placeholder="eg: 9876543210"
            value={form.phone}
            onChange={(v) => setForm({ ...form, phone: v })}
          />
        </div>

        {/* Inline error (e.g. save failed / 401) — no reload loop */}
        {error && (
          <div className="px-6 pt-2">
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 mt-2 border-t flex justify-end gap-3">
          {dismissible && (
            <button
              type="button"
              onClick={requestClose}
              className="px-6 py-3 rounded-lg font-medium text-gray-600 hover:bg-gray-100 transition"
            >
              Maybe later
            </button>
          )}
          <button
            disabled={!allFilled || loading}
            onClick={handleSubmit}
            className={`px-6 py-3 rounded-lg font-medium transition ${
              allFilled
                ? "bg-purple-600 text-white hover:bg-purple-700"
                : "bg-gray-300 text-gray-500 cursor-not-allowed"
            }`}
          >
            {loading ? "Saving..." : "Update & Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* Reusable Input */
function Input({
  label,
  value,
  onChange,
  placeholder,
  inputRef,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  required?: boolean;
}) {
  const inputId = useId();
  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium mb-1">{label}</label>
      <input
        id={inputId}
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        aria-required={required ? true : undefined}
        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-200"
      />
    </div>
  );
}
