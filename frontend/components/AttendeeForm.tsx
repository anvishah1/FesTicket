// frontend/components/AttendeeForm.tsx

import { useRef, useState } from "react";

// Read a File's text. Blob.text() is the modern path; fall back to FileReader
// for environments (older browsers / jsdom) that don't implement Blob.text.
function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

// RFC-4180-aware CSV tokenizer. A quoted field may contain commas, embedded
// newlines, and escaped quotes (""). A naive split(",") would corrupt a value
// like "Last, First" by breaking it across columns.
function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false; // has the current record seen any char yet?

  const endField = () => {
    record.push(field);
    field = "";
  };
  const endRecord = () => {
    endField();
    records.push(record);
    record = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // consume the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      started = true;
    } else if (ch === ",") {
      endField();
      started = true;
    } else if (ch === "\n") {
      endRecord();
    } else if (ch === "\r") {
      // swallow CR; the following LF (or EOF) ends the record
    } else {
      field += ch;
      started = true;
    }
  }
  // Flush a trailing record that had no closing newline.
  if (started || field.length > 0 || record.length > 0) endRecord();
  return records;
}

// Parse a small "name,email" CSV. Header-tolerant: if the first row looks like a
// header (contains "name"/"email" and no "@"), it is skipped. Accepts either
// column order when a header names them; otherwise assumes name,email. Extra
// columns are ignored, blank rows dropped, quoted commas preserved.
export function parseAttendeeCsv(text: string): { name: string; email: string }[] {
  const rows = parseCsvRecords(text)
    .map((cols) => cols.map((c) => c.trim()))
    .filter((cols) => cols.some((c) => c.length > 0));
  if (rows.length === 0) return [];

  let nameIdx = 0;
  let emailIdx = 1;
  let start = 0;
  const first = rows[0].map((c) => c.toLowerCase());
  const looksLikeHeader = !first.some((c) => c.includes("@")) && first.some((c) => c === "name" || c === "email");
  if (looksLikeHeader) {
    const n = first.indexOf("name");
    const e = first.indexOf("email");
    if (n !== -1) nameIdx = n;
    if (e !== -1) emailIdx = e;
    start = 1;
  }

  const out: { name: string; email: string }[] = [];
  for (let i = start; i < rows.length; i++) {
    const cols = rows[i];
    const name = (cols[nameIdx] || "").trim();
    const email = (cols[emailIdx] || "").trim();
    if (!name && !email) continue;
    out.push({ name, email });
  }
  return out;
}

export default function AttendeeForm({
  requiredCount,
  attendees,
  onChange,
}: {
  requiredCount: number;
  attendees: { name: string; email: string }[];
  onChange: (a: { name: string; email: string }[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

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

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Allow re-importing the same file (onChange won't fire again otherwise).
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const text = await readFileText(file);
    const parsed = parseAttendeeCsv(text);
    if (parsed.length === 0) {
      setImportMsg("No attendee rows found in that file.");
      return;
    }
    // Never exceed the number of tickets being purchased.
    const capped = parsed.slice(0, requiredCount);
    onChange(capped);
    setImportMsg(
      parsed.length > requiredCount
        ? `Imported ${capped.length} of ${parsed.length} rows (limited to ${requiredCount} ticket${requiredCount === 1 ? "" : "s"}).`
        : `Imported ${capped.length} attendee${capped.length === 1 ? "" : "s"}.`
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-[var(--text-strong)]">Attendees ({attendees.length}/{requiredCount})</div>
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            onChange={onImportFile}
            className="hidden"
            data-testid="attendee-csv-input"
            aria-label="Import attendees from CSV"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-sm text-[var(--text-primary)] hover:underline"
          >
            Import from CSV
          </button>
          <button
            type="button"
            onClick={add}
            disabled={attendees.length >= requiredCount}
            className="text-sm text-[var(--text-primary)] hover:underline disabled:opacity-50"
          >
            + Add attendee
          </button>
        </div>
      </div>

      {importMsg && (
        <div className="text-xs text-[var(--text-soft)]" data-testid="csv-import-msg">
          {importMsg} <span className="text-[var(--text-faint)]">Expected columns: name, email.</span>
        </div>
      )}

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
