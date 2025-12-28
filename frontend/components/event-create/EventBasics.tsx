"use client";

interface EventBasicsProps {
  onNext: () => void;
}

export default function EventBasics({ onNext }: EventBasicsProps) {
  return (
    <div className="flex-1 rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-semibold text-gray-900">
        Event Basics
      </h2>

      <div className="space-y-6">
        {/* Event Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Event Name
          </label>
          <input
            type="text"
            placeholder="eg: KSUM Investor’s Meet"
            className="mt-2 w-full rounded-lg border px-4 py-2 focus:border-emerald-600 focus:outline-none"
          />
        </div>

        {/* Short Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Short Description
          </label>
          <textarea
            rows={2}
            placeholder="Describe your event in one or two lines"
            className="mt-2 w-full rounded-lg border px-4 py-2 focus:border-emerald-600 focus:outline-none"
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Event Starts From
            </label>
            <input
              type="datetime-local"
              className="mt-2 w-full rounded-lg border px-4 py-2 focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Event Ends On
            </label>
            <input
              type="datetime-local"
              className="mt-2 w-full rounded-lg border px-4 py-2 focus:border-emerald-600 focus:outline-none"
            />
          </div>
        </div>

        {/* Visibility */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Event Visibility
          </label>
          <div className="flex gap-4">
            <OptionButton label="Private" active />
            <OptionButton label="Public" />
          </div>
        </div>

        {/* Event Type */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Event Type
          </label>
          <div className="flex gap-4">
            <OptionButton label="Offline" active />
            <OptionButton label="Online" />
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Status
          </label>
          <div className="flex gap-4">
            <OptionButton label="Draft" active />
            <OptionButton label="Published" />
          </div>
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

function OptionButton({
  label,
  active = false,
}: {
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
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
