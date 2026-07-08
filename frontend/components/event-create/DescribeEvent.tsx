"use client";

import { useState, useEffect } from "react";
import { CATEGORY_LABELS } from "@/lib/categories";

interface DescribeEventProps {
  onNext: (data: DescribeEventData) => void;
  /** Fires on every edit so the wizard persists in-progress input (H11). */
  onChange?: (data: DescribeEventData) => void;
  initialData?: DescribeEventData;
}

export interface DescribeEventData {
  description: string;
  category: string;
  audience: string;
}

// SEO-10: single source of truth for categories (shared with the discover facets
// + backend validator) so the list never drifts.
const categories = CATEGORY_LABELS;

export default function DescribeEvent({ onNext, onChange, initialData }: DescribeEventProps) {
  const [formData, setFormData] = useState<DescribeEventData>(initialData || {
    description: "",
    category: "Workshop",
    audience: "",
  });

  useEffect(() => {
    onChange?.(formData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  const handleSubmit = () => {
    onNext(formData);
  };

  return (
    <div className="flex-1 rounded-xl border border-[#C5BAC4] bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-semibold text-[#29104A]">
        Describe Your Event
      </h2>

      <div className="space-y-6">
        {/* Event Description */}
        <div>
          <label htmlFor="describe-description" className="block text-sm font-medium text-[#29104A]">
            Event Description
          </label>
          <textarea
            id="describe-description"
            rows={6}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Tell people what your event is about, what they can expect, and why they should attend."
            className="mt-2 w-full rounded-lg border border-[#C5BAC4] px-4 py-3 text-sm focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 focus:outline-none text-[#29104A]"
          />
          <p className="mt-1 text-xs text-[#6B597F]">
            This description will appear on your event page.
          </p>
        </div>

        {/* Tags / Categories */}
        <div>
          <span id="describe-category-label" className="block text-sm font-medium text-[#29104A]">
            Event Category
          </span>
          <div className="mt-2 flex flex-wrap gap-3" role="group" aria-labelledby="describe-category-label">
            {categories.map((cat) => (
              <Tag
                key={cat}
                label={cat}
                active={formData.category === cat}
                onClick={() => setFormData({ ...formData, category: cat })}
              />
            ))}
          </div>
          <p className="mt-1 text-xs text-[#6B597F]">
            Choose a category that best fits your event.
          </p>
        </div>

        {/* Audience */}
        <div>
          <label htmlFor="describe-audience" className="block text-sm font-medium text-[#29104A]">
            Intended Audience
          </label>
          <textarea
            id="describe-audience"
            rows={3}
            value={formData.audience}
            onChange={(e) => setFormData({ ...formData, audience: e.target.value })}
            placeholder="Who should attend this event? (eg: students, founders, developers)"
            className="mt-2 w-full rounded-lg border border-[#C5BAC4] px-4 py-3 text-sm focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 focus:outline-none text-[#29104A]"
          />
        </div>

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

function Tag({
  label,
  active = false,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm transition
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
