"use client";

import { useState } from "react";

type Question = {
  id: number;
  label: string;
  required: boolean;
};

export default function RegistrationForm() {
  const [questions, setQuestions] = useState<Question[]>([
    {
      id: 1,
      label: "Why do you want to attend this event?",
      required: false,
    },
  ]);

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

  return (
    <div className="flex-1 rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-semibold text-gray-900">
        Registration Form
      </h2>

      <div className="space-y-8">
        {/* Default Fields */}
        <section>
          <h3 className="mb-3 text-sm font-medium text-gray-800">
            Default Attendee Fields
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <LockedField label="First Name" />
            <LockedField label="Last Name" />
            <LockedField label="Email" />
            <LockedField label="Phone Number" />
          </div>

          <p className="mt-2 text-xs text-gray-500">
            These fields are mandatory and cannot be removed.
          </p>
        </section>

        {/* Custom Questions */}
        <section className="space-y-4">
          <h3 className="text-sm font-medium text-gray-800">
            Additional Questions
          </h3>

          {questions.map((q, index) => (
            <div
              key={q.id}
              className="rounded-lg border bg-gray-50 p-4 space-y-3"
            >
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">
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
                className="w-full rounded-lg border px-3 py-2 focus:border-emerald-600 focus:outline-none"
              />

              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) =>
                    updateQuestion(q.id, { required: e.target.checked })
                  }
                />
                Required
              </label>
            </div>
          ))}

          <button
            onClick={addQuestion}
            className="w-full rounded-lg border-2 border-dashed py-4 text-gray-600 hover:border-gray-400 transition"
          >
            + Add another question
          </button>
        </section>

        {/* Final Save */}
        <button className="mt-6 w-full rounded-lg bg-emerald-700 py-3 text-white font-medium hover:bg-emerald-800 transition">
          Save Registration Form
        </button>
      </div>
    </div>
  );
}

function LockedField({ label }: { label: string }) {
  return (
    <div className="rounded-lg border bg-gray-100 px-4 py-2 text-sm text-gray-700">
      {label}
    </div>
  );
}
