"use client";

import { useState, useEffect } from "react";
import { showToast } from "@/lib/toast";

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
      showToast("Please enter a venue name", "error");
      return;
    }
    if (formData.locationType === "ONLINE" && !formData.meetingLink.trim()) {
      showToast("Please enter a meeting link", "error");
      return;
    }
    onNext(formData);
  };

  return (
    <div className="flex-1 rounded-xl border border-[var(--border-card)] bg-[var(--surface)] p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-semibold text-[var(--text-primary)]">
        Event Location
      </h2>

      <div className="space-y-6">
        {/* Mode */}
        <div>
          <span id="location-type-label" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">
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
              <label htmlFor="location-venue" className="block text-sm font-medium text-[var(--text-primary)]">
                Venue Name <span className="text-[var(--text-secondary)]">*</span>
              </label>
              <input
                id="location-venue"
                value={formData.venue}
                onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                placeholder="eg: Kerala Startup Mission"
                className="mt-2 w-full rounded-lg border border-[var(--border-card)] px-4 py-2 focus:border-[var(--border-plum)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:outline-none text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label htmlFor="location-address" className="block text-sm font-medium text-[var(--text-primary)]">
                Address
              </label>
              <textarea
                id="location-address"
                rows={3}
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Street address, city, state"
                className="mt-2 w-full rounded-lg border border-[var(--border-card)] px-4 py-2 focus:border-[var(--border-plum)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:outline-none text-[var(--text-primary)]"
              />
            </div>

            {/* Map placeholder */}
            <div className="rounded-lg border border-[var(--border-card)] bg-[color-mix(in_srgb,var(--surface-card)_10%,transparent)] p-4 text-center text-sm text-[var(--text-muted)]">
              Map preview will appear here
            </div>
          </>
        )}

        {/* Online Fields */}
        {formData.locationType === "ONLINE" && (
          <div>
            <label htmlFor="location-meeting-link" className="block text-sm font-medium text-[var(--text-primary)]">
              Meeting Link <span className="text-[var(--text-secondary)]">*</span>
            </label>
            <input
              id="location-meeting-link"
              value={formData.meetingLink}
              onChange={(e) => setFormData({ ...formData, meetingLink: e.target.value })}
              placeholder="https://zoom.us / https://meet.google.com"
              className="mt-2 w-full rounded-lg border border-[var(--border-card)] px-4 py-2 focus:border-[var(--border-plum)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:outline-none text-[var(--text-primary)]"
            />
          </div>
        )}

        {/* Save */}
        <button
          onClick={handleSubmit}
          className="mt-6 w-full rounded-lg bg-[var(--fill-plum)] py-3 text-white font-medium hover:bg-[var(--fill-ink)] transition"
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
            ? "border-[var(--border-plum)] bg-[color-mix(in_srgb,var(--fill-plum)_10%,transparent)] text-[var(--text-secondary)]"
            : "border-[var(--border-card)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--surface-card)_20%,transparent)]"
        }`}
    >
      {label}
    </button>
  );
}
