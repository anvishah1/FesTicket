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
    <aside className="flex lg:flex-col w-full lg:w-64 lg:shrink-0 gap-2 lg:gap-3 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0">
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
            className={`w-auto lg:w-full shrink-0 whitespace-nowrap rounded-xl border px-4 py-3 text-left transition-all
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-plum)] focus-visible:ring-offset-2
              ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}
              ${
                isActive
                  ? "border-[var(--border-plum)] bg-[color-mix(in_srgb,var(--fill-plum)_10%,transparent)] text-[var(--text-secondary)] font-medium"
                  : isCompleted
                  ? "border-[var(--border-card)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[color-mix(in_srgb,var(--surface-card)_20%,transparent)]"
                  : "border-[var(--border-card)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--surface-card)_20%,transparent)]"
              }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  isActive
                    ? "bg-[var(--fill-plum)] text-white"
                    : isCompleted
                    ? "bg-green-500 text-white"
                    : "bg-[color-mix(in_srgb,var(--surface-card)_50%,transparent)] text-[var(--text-muted)]"
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
                <span className="text-sm text-[var(--text-secondary)]" aria-hidden="true">●</span>
              )}
            </div>
          </button>
        );
      })}
    </aside>
  );
}
