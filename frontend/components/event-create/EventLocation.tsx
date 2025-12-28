"use client";

import { useState } from "react";

interface EventLocationProps {
  onNext: () => void;
}

export default function EventLocation({ onNext }: EventLocationProps) {
  const [mode, setMode] = useState<"offline" | "online">("offline");

  return (
    <div className="flex-1 rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-semibold text-gray-900">
        Event Location
      </h2>

      <div className="space-y-6">
        {/* Mode */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Location Type
          </label>

          <div className="flex gap-4">
            <ToggleButton
              label="Offline"
              active={mode === "offline"}
              onClick={() => setMode("offline")}
            />
            <ToggleButton
              label="Online"
              active={mode === "online"}
              onClick={() => setMode("online")}
            />
          </div>
        </div>

        {/* Offline Fields */}
        {mode === "offline" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Venue Name
              </label>
              <input
                placeholder="eg: Kerala Startup Mission"
                className="mt-2 w-full rounded-lg border px-4 py-2 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Address
              </label>
              <textarea
                rows={3}
                placeholder="Street address, city, state"
                className="mt-2 w-full rounded-lg border px-4 py-2 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            {/* Map placeholder */}
            <div className="rounded-lg border bg-gray-50 p-4 text-center text-sm text-gray-500">
              Map preview will appear here
            </div>
          </>
        )}

        {/* Online Fields */}
        {mode === "online" && (
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Meeting Link
            </label>
            <input
              placeholder="https://zoom.us / https://meet.google.com"
              className="mt-2 w-full rounded-lg border px-4 py-2 focus:border-emerald-600 focus:outline-none"
            />
          </div>
        )}

        {/* Save */}
        <button
          onClick={onNext}
          className="mt-6 w-full rounded-lg bg-emerald-700 py-3 text-white font-medium hover:bg-emerald-800 transition"
        >
          Save & Continue
        </button>
      </div>
    </div>
  );
}

function ToggleButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition
        ${
          active
            ? "border-emerald-600 bg-emerald-50 text-emerald-800"
            : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
        }`}
    >
      {label}
    </button>
  );
}
