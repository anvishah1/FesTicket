"use client";

import { useState, useEffect } from "react";

interface EventLocationProps {
  onNext: (data: EventLocationData) => void;
  /** Fires on every edit so the wizard persists in-progress input (H11). */
  onChange?: (data: EventLocationData) => void;
  initialData?: EventLocationData;
}

export interface EventLocationData {
  locationType: "OFFLINE" | "ONLINE";
  venue: string;
  address: string;
  meetingLink: string;
}

export default function EventLocation({ onNext, onChange, initialData }: EventLocationProps) {
  const [formData, setFormData] = useState<EventLocationData>(initialData || {
    locationType: "OFFLINE",
    venue: "",
    address: "",
    meetingLink: "",
  });

  useEffect(() => {
    onChange?.(formData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  const handleSubmit = () => {
    if (formData.locationType === "OFFLINE" && !formData.venue.trim()) {
      alert("Please enter a venue name");
      return;
    }
    if (formData.locationType === "ONLINE" && !formData.meetingLink.trim()) {
      alert("Please enter a meeting link");
      return;
    }
    onNext(formData);
  };

  return (
    <div className="flex-1 rounded-xl border border-[#C5BAC4] bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-semibold text-[#29104A]">
        Event Location
      </h2>

      <div className="space-y-6">
        {/* Mode */}
        <div>
          <span id="location-type-label" className="mb-2 block text-sm font-medium text-[#29104A]">
            Location Type
          </span>

          <div className="flex gap-4" role="group" aria-labelledby="location-type-label">
            <ToggleButton
              label="Offline"
              active={formData.locationType === "OFFLINE"}
              onClick={() => setFormData({ ...formData, locationType: "OFFLINE" })}
            />
            <ToggleButton
              label="Online"
              active={formData.locationType === "ONLINE"}
              onClick={() => setFormData({ ...formData, locationType: "ONLINE" })}
            />
          </div>
        </div>

        {/* Offline Fields */}
        {formData.locationType === "OFFLINE" && (
          <>
            <div>
              <label htmlFor="location-venue" className="block text-sm font-medium text-[#29104A]">
                Venue Name <span className="text-[#522C5D]">*</span>
              </label>
              <input
                id="location-venue"
                value={formData.venue}
                onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                placeholder="eg: Kerala Startup Mission"
                className="mt-2 w-full rounded-lg border border-[#C5BAC4] px-4 py-2 focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 focus:outline-none text-[#29104A]"
              />
            </div>

            <div>
              <label htmlFor="location-address" className="block text-sm font-medium text-[#29104A]">
                Address
              </label>
              <textarea
                id="location-address"
                rows={3}
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Street address, city, state"
                className="mt-2 w-full rounded-lg border border-[#C5BAC4] px-4 py-2 focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 focus:outline-none text-[#29104A]"
              />
            </div>

            {/* Map placeholder */}
            <div className="rounded-lg border border-[#C5BAC4] bg-[#C5BAC4]/10 p-4 text-center text-sm text-[#6B597F]">
              Map preview will appear here
            </div>
          </>
        )}

        {/* Online Fields */}
        {formData.locationType === "ONLINE" && (
          <div>
            <label htmlFor="location-meeting-link" className="block text-sm font-medium text-[#29104A]">
              Meeting Link <span className="text-[#522C5D]">*</span>
            </label>
            <input
              id="location-meeting-link"
              value={formData.meetingLink}
              onChange={(e) => setFormData({ ...formData, meetingLink: e.target.value })}
              placeholder="https://zoom.us / https://meet.google.com"
              className="mt-2 w-full rounded-lg border border-[#C5BAC4] px-4 py-2 focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 focus:outline-none text-[#29104A]"
            />
          </div>
        )}

        {/* Save */}
        <button
          onClick={handleSubmit}
          className="mt-6 w-full rounded-lg bg-[#522C5D] py-3 text-white font-medium hover:bg-[#29104A] transition"
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
      aria-pressed={active}
      onClick={onClick}
      className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition
        ${
          active
            ? "border-[#522C5D] bg-[#522C5D]/10 text-[#522C5D]"
            : "border-[#C5BAC4] bg-white text-[#6B597F] hover:bg-[#C5BAC4]/20"
        }`}
    >
      {label}
    </button>
  );
}
