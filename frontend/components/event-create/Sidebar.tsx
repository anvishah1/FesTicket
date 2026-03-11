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
  { id: "form", label: "Registration Form" },
];

export default function Sidebar({ current, onChange }: SidebarProps) {
  return (
    <aside className="w-64 shrink-0 space-y-3">
      {steps.map((step, index) => {
        const isActive = current === step.id;
        const currentIndex = steps.findIndex((s) => s.id === current);
        const isCompleted = index < currentIndex;

        return (
          <button
            key={step.id}
            onClick={() => onChange(step.id)}
            className={`w-full rounded-xl border px-4 py-3 text-left transition-all
              ${
                isActive
                  ? "border-[#522C5D] bg-[#522C5D]/10 text-[#522C5D] font-medium"
                  : isCompleted
                  ? "border-[#C5BAC4] bg-white text-[#29104A] hover:bg-[#C5BAC4]/20"
                  : "border-[#C5BAC4] bg-white text-[#6B597F] hover:bg-[#C5BAC4]/20"
              }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  isActive
                    ? "bg-[#522C5D] text-white"
                    : isCompleted
                    ? "bg-green-500 text-white"
                    : "bg-[#C5BAC4]/50 text-[#6B597F]"
                }`}>
                  {isCompleted ? (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </span>
                <span>{step.label}</span>
              </div>

              {isActive && (
                <span className="text-sm text-[#522C5D]">●</span>
              )}
            </div>
          </button>
        );
      })}
    </aside>
  );
}
