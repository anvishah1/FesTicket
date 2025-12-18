"use client";

import { useState } from "react";

interface Props {
  open: boolean;
  onSubmit: (data: {
    firstName: string;
    lastName: string;
    organiserName: string;
    phone: string;
  }) => Promise<void>;
}

export default function CompleteProfileModal({ open, onSubmit }: Props) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    organiserName: "",
    phone: "",
  });

  const [loading, setLoading] = useState(false);

  const allFilled =
    form.firstName &&
    form.lastName &&
    form.organiserName &&
    form.phone.length >= 10;

  if (!open) return null;

  async function handleSubmit() {
    if (!allFilled) return;
    setLoading(true);
    await onSubmit(form);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Basic Profile</h2>
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
        <div className="px-6 pb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="First Name"
            value={form.firstName}
            onChange={(v) => setForm({ ...form, firstName: v })}
          />
          <Input
            label="Last Name"
            value={form.lastName}
            onChange={(v) => setForm({ ...form, lastName: v })}
          />
          <Input
            label="Organiser Name"
            placeholder="Displayed as Event Organiser"
            value={form.organiserName}
            onChange={(v) => setForm({ ...form, organiserName: v })}
          />
          <Input
            label="Phone Number"
            placeholder="eg: 9876543210"
            value={form.phone}
            onChange={(v) => setForm({ ...form, phone: v })}
          />
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex justify-end">
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-200"
      />
    </div>
  );
}
