"use client";

interface SidebarProps {
  current: string;
  onChange: (step: Step) => void;
  /**
   * Optional gate: return false to prevent jumping to a step. When omitted,
   * every step is navigable (preserves the standalone/default behaviour).
   */
  isStepEnabled?: (step: Step) => boolean;
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

export default function Sidebar({ current, onChange, isStepEnabled }: SidebarProps) {
  const currentIndex = steps.findIndex((s) => s.id === current);
  return (
    <aside className="w-64 shrink-0 space-y-3">
      {steps.map((step, index) => {
        const isActive = current === step.id;
        const isCompleted = index < currentIndex;
        // A step is locked only when a gate is supplied AND rejects it. The
        // active step is always clickable so you can never trap yourself.
        const isDisabled =
          !isActive && !!isStepEnabled && !isStepEnabled(step.id);

        return (
          <button
            key={step.id}
            type="button"
            // Use aria-disabled (not the native `disabled` attribute) so a locked
            // step stays in the tab order and screen readers announce it as
            // "dimmed/unavailable" instead of skipping it entirely (WCAG 4.1.2).
            aria-disabled={isDisabled || undefined}
            aria-current={isActive ? "step" : undefined}
            title={isDisabled ? "Complete the earlier steps first" : undefined}
            onClick={() => {
              if (isDisabled) return;
              onChange(step.id);
            }}
            className={`w-full rounded-xl border px-4 py-3 text-left transition-all
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#522C5D] focus-visible:ring-offset-2
              ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}
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
                <span className="text-sm text-[#522C5D]" aria-hidden="true">●</span>
              )}
            </div>
          </button>
        );
      })}
    </aside>
  );
}
