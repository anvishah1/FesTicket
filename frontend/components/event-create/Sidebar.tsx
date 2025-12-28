"use client";

interface SidebarProps {
  current: string;
  onChange: (step: Step) => void;
}

type Step =
  | "basics"
  | "describe"
  | "location"
  | "tickets"
  | "form";

const steps: { id: Step; label: string }[] = [
  { id: "basics", label: "Event Basics" },
  { id: "describe", label: "Describe Your Event" },
  { id: "location", label: "Event Location" },
  { id: "tickets", label: "Tickets" },
  { id: "form", label: "Form (Optional)" },
];

export default function Sidebar({ current, onChange }: SidebarProps) {
  return (
    <aside className="w-64 shrink-0 space-y-3">
      {steps.map((step) => {
        const isActive = current === step.id;

        return (
          <button
            key={step.id}
            onClick={() => onChange(step.id)}
            className={`w-full rounded-xl border px-4 py-3 text-left transition-all
              ${
                isActive
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800 font-medium"
                  : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
          >
            <div className="flex items-center justify-between">
              <span>{step.label}</span>

              {isActive && (
                <span className="text-sm text-emerald-600">●</span>
              )}
            </div>
          </button>
        );
      })}
    </aside>
  );
}
