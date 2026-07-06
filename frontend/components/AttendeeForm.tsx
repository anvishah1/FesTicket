// frontend/components/AttendeeForm.tsx

export default function AttendeeForm({
  requiredCount,
  attendees,
  onChange,
}: {
  requiredCount: number;
  attendees: { name: string; email: string }[];
  onChange: (a: { name: string; email: string }[]) => void;
}) {
  const add = () => {
    if (attendees.length >= requiredCount) return;
    onChange([...attendees, { name: "", email: "" }]);
  };
  const remove = (idx: number) => {
    const copy = [...attendees];
    copy.splice(idx, 1);
    onChange(copy);
  };
  const update = (idx: number, field: "name" | "email", value: string) => {
    const copy = [...attendees];
    copy[idx] = { ...copy[idx], [field]: value };
    onChange(copy);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-700">Attendees ({attendees.length}/{requiredCount})</div>
        <div>
          <button
            type="button"
            onClick={add}
            disabled={attendees.length >= requiredCount}
            className="text-sm text-primary-600 hover:underline disabled:opacity-50"
          >
            + Add attendee
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {attendees.map((a, i) => (
          <div key={i} className="border rounded-md p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Attendee {i + 1}</div>
              <button className="text-xs text-red-500" onClick={() => remove(i)} aria-label={`Remove attendee ${i + 1}`}>
                Remove
              </button>
            </div>

            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={a.name}
                onChange={(e) => update(i, "name", e.target.value)}
                placeholder="Full name"
                className="border rounded-md px-3 py-2"
                aria-label={`Name for attendee ${i + 1}`}
              />
              <input
                value={a.email}
                onChange={(e) => update(i, "email", e.target.value)}
                placeholder="Email address"
                className="border rounded-md px-3 py-2"
                aria-label={`Email for attendee ${i + 1}`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
