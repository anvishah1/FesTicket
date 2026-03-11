"use client";

import { useState } from "react";

interface RegistrationFormProps {
  onSubmit: (data: RegistrationFormData) => void;
  isSubmitting?: boolean;
  initialData?: RegistrationFormData;
}

export type Question = {
  id: number;
  label: string;
  required: boolean;
};

export interface RegistrationFormData {
  questions: Question[];
}

export default function RegistrationForm({ onSubmit, isSubmitting, initialData }: RegistrationFormProps) {
  const [questions, setQuestions] = useState<Question[]>(
    initialData?.questions || [
      {
        id: 1,
        label: "Why do you want to attend this event?",
        required: false,
      },
    ]
  );

  function addQuestion() {
    setQuestions([
      ...questions,
      { id: Date.now(), label: "", required: false },
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
    onSubmit({ questions: questions.filter((q) => q.label.trim()) });
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
                    onClick={() => deleteQuestion(q.id)}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>

              <input
                placeholder="Enter your question here"
                value={q.label}
                onChange={(e) =>
                  updateQuestion(q.id, { label: e.target.value })
                }
                className="w-full rounded-lg border border-[#C5BAC4] px-3 py-2 focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 focus:outline-none text-[#29104A]"
              />

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
            onClick={addQuestion}
            className="w-full rounded-lg border-2 border-dashed border-[#C5BAC4] py-4 text-[#6B597F] hover:border-[#522C5D] hover:text-[#522C5D] transition"
          >
            + Add another question
          </button>
        </section>

        {/* Final Save */}
        <button
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
