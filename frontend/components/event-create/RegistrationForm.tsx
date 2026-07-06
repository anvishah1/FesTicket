"use client";

import { useState, useEffect } from "react";

interface RegistrationFormProps {
  onSubmit?: (data: RegistrationFormData) => void;
  /** Fires on every edit so the wizard persists in-progress input (H11). */
  onChange?: (data: RegistrationFormData) => void;
  isSubmitting?: boolean;
  initialData?: RegistrationFormData;
}

/** Input kinds a host can pick for a custom question. Mirrors the `type`
 *  column persisted by the backend (defaults to "text"). */
export const QUESTION_TYPES = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email address" },
] as const;

export type Question = {
  id: number;
  label: string;
  type: string;
  required: boolean;
};

export interface RegistrationFormData {
  questions: Question[];
}

export default function RegistrationForm({ onSubmit, onChange, isSubmitting, initialData }: RegistrationFormProps) {
  const [questions, setQuestions] = useState<Question[]>(
    initialData?.questions || [
      {
        id: 1,
        label: "Why do you want to attend this event?",
        type: "text",
        required: false,
      },
    ]
  );

  useEffect(() => {
    onChange?.({ questions });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  function addQuestion() {
    setQuestions([
      ...questions,
      { id: Date.now(), label: "", type: "text", required: false },
    ]);
  }

  function updateQuestion(id: number, updates: Partial<Question>) {
    setQuestions(
      questions.map((q) => (q.id === id ? { ...q, ...updates } : q))
    );
  }

  function deleteQuestion(id: number) {
    setQuestions(questions.filter((q) => q.id !== id));
  }

  const handleSubmit = () => {
    onSubmit?.({ questions: questions.filter((q) => q.label.trim()) });
  };

  return (
    <div className="flex-1 rounded-xl border border-[#C5BAC4] bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-semibold text-[#29104A]">
        Registration Form
      </h2>

      <div className="space-y-8">
        {/* Default Fields */}
        <section>
          <h3 className="mb-3 text-sm font-medium text-[#29104A]">
            Default Attendee Fields
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <LockedField label="First Name" />
            <LockedField label="Last Name" />
            <LockedField label="Email" />
            <LockedField label="Phone Number" />
          </div>

          <p className="mt-2 text-xs text-[#6B597F]">
            These fields are mandatory and cannot be removed.
          </p>
        </section>

        {/* Custom Questions */}
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-[#29104A]">
            Additional Questions
          </h3>

          <p className="text-xs text-[#6B597F]">
            Custom questions are saved with the event and shown to attendees at
            booking. The default attendee fields above are always collected.
          </p>

          {questions.map((q, index) => (
            <div
              key={q.id}
              className="rounded-lg border border-[#C5BAC4] bg-[#C5BAC4]/10 p-4 space-y-3"
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-[#29104A]">
                  Question {index + 1}
                </span>

                {questions.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove question ${index + 1}`}
                    onClick={() => deleteQuestion(q.id)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>

              <label htmlFor={`question-label-${q.id}`} className="sr-only">
                Question {index + 1} text
              </label>
              <input
                id={`question-label-${q.id}`}
                placeholder="Enter your question here"
                value={q.label}
                onChange={(e) =>
                  updateQuestion(q.id, { label: e.target.value })
                }
                className="w-full rounded-lg border border-[#C5BAC4] px-3 py-2 focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 focus:outline-none text-[#29104A]"
              />

              <label className="block text-xs text-[#6B597F]">
                Answer type
                <select
                  aria-label={`Answer type for question ${index + 1}`}
                  value={q.type}
                  onChange={(e) =>
                    updateQuestion(q.id, { type: e.target.value })
                  }
                  className="mt-1 w-full rounded-lg border border-[#C5BAC4] px-3 py-2 focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 focus:outline-none text-[#29104A] bg-white"
                >
                  {QUESTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm text-[#6B597F]">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) =>
                    updateQuestion(q.id, { required: e.target.checked })
                  }
                  className="rounded border-[#C5BAC4] text-[#522C5D] focus:ring-[#522C5D]"
                />
                Required
              </label>
            </div>
          ))}

          <button
            type="button"
            onClick={addQuestion}
            className="w-full rounded-lg border-2 border-dashed border-[#C5BAC4] py-4 text-[#6B597F] hover:border-[#522C5D] hover:text-[#522C5D] transition"
          >
            + Add another question
          </button>
        </section>

        {/* Final Save */}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="mt-6 w-full rounded-lg bg-[#522C5D] py-3 text-white font-medium hover:bg-[#29104A] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Creating Event...
            </>
          ) : (
            "Create Event"
          )}
        </button>
      </div>
    </div>
  );
}

function LockedField({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-[#C5BAC4] bg-[#C5BAC4]/30 px-4 py-2 text-sm text-[#6B597F]">
      {label}
    </div>
  );
}
