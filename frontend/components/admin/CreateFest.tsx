"use client";

import { useState, useRef } from "react";
import { getApiUrl, getAccessToken } from "@/lib/auth";

export default function CreateFest() {

  const [form, setForm] = useState({
    name: "",
    college: "",
    description: "",
    image: "",
    startDate: "",
    endDate: ""
  });

  const fileRef = useRef<HTMLInputElement>(null);

  const getMinDate = () => {
    const now = new Date();
    return now.toISOString().split("T")[0];
  };

  const handleSubmit = async () => {

    if (!form.name.trim()) return alert("Fest name required");
    if (!form.college.trim()) return alert("College required");

    if (!form.startDate || !form.endDate) {
      return alert("Select valid dates");
    }

    if (new Date(form.endDate) < new Date(form.startDate)) {
      return alert("End date must be after start date");
    }

    try {

      const res = await fetch(`${getApiUrl()}/api/fests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAccessToken()}`
        },
        body: JSON.stringify(form)
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "Failed");
        return;
      }

      alert("Fest created successfully");

      setForm({
        name: "",
        college: "",
        description: "",
        image: "",
        startDate: "",
        endDate: ""
      });

    } catch (err) {
      alert("Server error");
    }
  };

  return (
    <div className="max-w-2xl bg-white border border-[#C5BAC4] rounded-2xl p-6 shadow-sm">

      <h2 className="text-xl font-semibold text-[#29104A] mb-6">
        Create New Fest
      </h2>

      <div className="space-y-5">

        {/* NAME */}
        <div>
          <label className="text-sm font-medium text-[#29104A]">
            Fest Name *
          </label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="mt-2 w-full border border-[#C5BAC4] rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D]"
          />
        </div>

        {/* COLLEGE */}
        <div>
          <label className="text-sm font-medium text-[#29104A]">
            College / Organization *
          </label>
          <input
            value={form.college}
            onChange={(e) => setForm({ ...form, college: e.target.value })}
            className="mt-2 w-full border border-[#C5BAC4] rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D]"
          />
        </div>

        {/* DESCRIPTION */}
        <div>
          <label className="text-sm font-medium text-[#29104A]">
            Description
          </label>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="mt-2 w-full border border-[#C5BAC4] rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D]"
          />
        </div>

        {/* IMAGE */}
        <div>
          <label className="text-sm font-medium text-[#29104A]">
            Fest Image
          </label>

          <div className="mt-2 flex gap-3">

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex-1 border-2 border-dashed border-[#C5BAC4] rounded-lg py-3 text-sm text-[#6B597F] hover:border-[#522C5D]"
            >
              Upload from device
            </button>

            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onloadend = () => {
                  setForm({ ...form, image: reader.result as string });
                };
                reader.readAsDataURL(file);
              }}
            />

          </div>

          <input
            placeholder="Or paste image URL (optional)"
            value={form.image}
            onChange={(e) => setForm({ ...form, image: e.target.value })}
            className="mt-3 w-full border border-[#C5BAC4] rounded-lg px-4 py-2"
          />

        </div>

        {/* DATES */}
        <div className="grid grid-cols-2 gap-4">

          <div>
            <label className="text-sm font-medium text-[#29104A]">
              Start Date
            </label>

            <input
              type="date"
              min={getMinDate()}
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="mt-2 w-full border border-[#C5BAC4] rounded-lg px-4 py-2"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-[#29104A]">
              End Date
            </label>

            <input
              type="date"
              min={form.startDate || getMinDate()}
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="mt-2 w-full border border-[#C5BAC4] rounded-lg px-4 py-2"
            />
          </div>

        </div>

        {/* ACTIONS */}
        <div className="flex justify-end gap-3 pt-4">

          <button className="px-5 py-2 rounded-lg bg-[#C5BAC4]/40 text-[#29104A]">
            Cancel
          </button>

          <button
            onClick={handleSubmit}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white"
          >
            Create Fest
          </button>

        </div>

      </div>
    </div>
  );
}