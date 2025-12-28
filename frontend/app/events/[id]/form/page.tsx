"use client";

import { useState } from "react";
import Header from "@/components/Header";

type Question = {
  id: number;
  label: string;
  description?: string;
  type: "short" | "number";
  required: boolean;
};

export default function EventFormBuilderPage() {
  const [questions, setQuestions] = useState<Question[]>([
    {
      id: 1,
      label: "Why do you want to attend this event?",
      description: "",
      type: "short",
      required: false,
    },
  ]);

  function addQuestion() {
    setQuestions([
      ...questions,
      {
        id: Date.now(),
        label: "",
        description: "",
        type: "short",
        required: false,
      },
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
    <div className="min-h-screen bg-[#fafafa]">
      <Header />

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Default fields */}
        <section className="bg-white rounded-xl border p-6">
          <h2 className="text-lg font-semibold mb-4">
            Attendee Details (Required)
          </h2>

          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
            <LockedField label="First Name" />
            <LockedField label="Last Name" />
            <LockedField label="Email" />
            <LockedField label="Phone" />
          </div>
        </section>

        {/* Custom Questions */}
        <section className="bg-white rounded-xl border p-6 space-y-4">
          <h2 className="text-lg font-semibold">Custom Questions</h2>

          {questions.map((q) => (
            <div
              key={q.id}
              className="border rounded-lg p-4 space-y-3 bg-gray-50"
            >
              <input
                placeholder="Question"
                value={q.label}
                onChange={(e) =>
                  updateQuestion(q.id, { label: e.target.value })
                }
                className="w-full border rounded-md px-3 py-2"
              />

              <input
                placeholder="Description (optional)"
                value={q.description}
                onChange={(e) =>
                  updateQuestion(q.id, { description: e.target.value })
                }
                className="w-full border rounded-md px-3 py-2 text-sm"
              />

              <div className="flex items-center justify-between text-sm">
                <select
                  value={q.type}
                  onChange={(e) =>
                    updateQuestion(q.id, {
                      type: e.target.value as Question["type"],
                    })
                  }
                  className="border rounded-md px-2 py-1"
                >
                  <option value="short">Short Answer</option>
                  <option value="number">Number</option>
                </select>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={q.required}
                      onChange={(e) =>
                        updateQuestion(q.id, { required: e.target.checked })
                      }
                    />
                    Required
                  </label>

                  <button
                    onClick={() => deleteQuestion(q.id)}
                    className="text-red-500 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Add question */}
          <button
            onClick={addQuestion}
            className="w-full border-2 border-dashed rounded-lg py-6 text-gray-500 hover:border-gray-400"
          >
            + Create Additional Question
          </button>
        </section>

        {/* Save */}
        <button className="w-full bg-green-700 text-white py-3 rounded-lg font-medium hover:bg-green-800">
          Save Form
        </button>
      </main>
    </div>
  );
}

function LockedField({ label }: { label: string }) {
  return (
    <div className="border rounded-md px-3 py-2 bg-gray-100">
      {label}
    </div>
  );
}
