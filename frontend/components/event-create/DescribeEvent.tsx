"use client";

interface DescribeEventProps {
  onNext: () => void;
}

export default function DescribeEvent({ onNext }: DescribeEventProps) {
  return (
    <div className="flex-1 rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-semibold text-gray-900">
        Describe Your Event
      </h2>

      <div className="space-y-6">
        {/* Event Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Event Description
          </label>
          <textarea
            rows={6}
            placeholder="Tell people what your event is about, what they can expect, and why they should attend."
            className="mt-2 w-full rounded-lg border px-4 py-3 text-sm focus:border-emerald-600 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-500">
            This description will appear on your event page.
          </p>
        </div>

        {/* Tags / Categories */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Event Category
          </label>
          <div className="mt-2 flex flex-wrap gap-3">
            <Tag label="Workshop" active />
            <Tag label="Networking" />
            <Tag label="Conference" />
            <Tag label="Meetup" />
            <Tag label="Hackathon" />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Choose a category that best fits your event.
          </p>
        </div>

        {/* Audience */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Intended Audience
          </label>
          <textarea
            rows={3}
            placeholder="Who should attend this event? (eg: students, founders, developers)"
            className="mt-2 w-full rounded-lg border px-4 py-3 text-sm focus:border-emerald-600 focus:outline-none"
          />
        </div>

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

function Tag({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`rounded-full border px-4 py-1.5 text-sm transition
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
