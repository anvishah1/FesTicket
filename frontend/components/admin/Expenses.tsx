"use client";

import { useEffect, useState } from "react";
import { getApiUrl, apiFetch, getStoredUser } from "@/lib/auth";
import { downloadMarketingFile } from "@/lib/files";
import { formatPaise, paiseToRupeeString } from "@/lib/format";
import { showToast } from "@/lib/toast";

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  url: string;
}

// Escape a value for a CSV cell (quote if it contains a comma/quote/newline).
function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

interface Expense {
  id: number;
  hostName: string;
  festName: string;
  description: string;
  category: string;
  vendor: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  proofFiles: UploadedFile[];
  billFiles: UploadedFile[];
  notes: string;
  createdAt: string;
}

// The backend stores category as a Prisma enum (e.g. INFRASTRUCTURE, ARTIST_FEES,
// SOUND_AV). Map each enum value to the human label used everywhere in this
// component (filter dropdown, colors, breakdown) so they all key off the SAME
// normalized value instead of silently mismatching the raw enum.
const CATEGORY_LABELS: Record<string, string> = {
  INFRASTRUCTURE: "Infrastructure",
  MARKETING: "Marketing",
  ARTIST_FEES: "Artist Fees",
  CATERING: "Catering",
  TRANSPORTATION: "Transportation",
  SECURITY: "Security",
  DECORATION: "Decoration",
  SOUND_AV: "Sound & AV",
  PRIZES: "Prizes",
  MISCELLANEOUS: "Miscellaneous",
};

// Normalize a raw backend category to its display label. Falls back to the raw
// value so an already-labeled or unknown category still renders (rather than
// disappearing from the filter/breakdown).
function categoryLabel(raw: string): string {
  return CATEGORY_LABELS[raw] ?? raw;
}

const expenseCategories = Object.values(CATEGORY_LABELS);

// ANL-06: reverse map (display label -> Prisma enum) so a category card can POST
// its budget keyed by the enum the backend stores.
const LABEL_TO_ENUM: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_LABELS).map(([enumVal, label]) => [label, enumVal])
);

interface Budget {
  id: number;
  category: string | null; // enum, or null for the overall fest budget
  amount: number; // paise
}

// ANL-06: budget-vs-actual bar with an over-budget badge and an inline editor.
function BudgetBar({
  actual,
  budget,
  canEdit,
  isEditing,
  editVal,
  saving,
  onStartEdit,
  onCancel,
  onChangeVal,
  onSave,
}: {
  actual: number;
  budget: number | null;
  canEdit: boolean;
  isEditing: boolean;
  editVal: string;
  saving: boolean;
  onStartEdit: () => void;
  onCancel: () => void;
  onChangeVal: (v: string) => void;
  onSave: (paise: number) => void;
}) {
  const over = budget != null && actual > budget;
  const frac = budget && budget > 0 ? Math.min(1, actual / budget) : 0;

  if (isEditing) {
    return (
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-xs text-[var(--text-muted)]">₹</span>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={editVal}
          onChange={(e) => onChangeVal(e.target.value)}
          placeholder="Budget"
          aria-label="Budget amount in rupees"
          className="w-24 rounded border border-[var(--border-card)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--text-primary)]"
          autoFocus
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            const r = parseFloat(editVal);
            if (Number.isFinite(r) && r >= 0) onSave(Math.round(r * 100));
          }}
          className="text-xs px-2 py-1 rounded bg-[var(--fill-plum)] text-white disabled:opacity-50"
        >
          Save
        </button>
        <button type="button" onClick={onCancel} aria-label="Cancel" className="text-xs px-1 text-[var(--text-muted)]">
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      {budget != null ? (
        <>
          <div className="w-full h-1.5 bg-[var(--surface-card)] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${over ? "bg-[#B42318]" : "bg-[var(--fill-plum)]"}`}
              style={{ width: `${frac * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 mt-1">
            <span className="text-[11px] text-[var(--text-muted)]">
              {formatPaise(actual)} / {formatPaise(budget)}
            </span>
            <div className="flex items-center gap-2">
              {over && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                  Over budget
                </span>
              )}
              {canEdit && (
                <button type="button" onClick={onStartEdit} className="text-[11px] text-[var(--text-secondary)] hover:underline">
                  Edit
                </button>
              )}
            </div>
          </div>
        </>
      ) : canEdit ? (
        <button type="button" onClick={onStartEdit} className="text-[11px] text-[var(--text-secondary)] hover:underline">
          + Set budget
        </button>
      ) : null}
    </div>
  );
}

interface ExpensesProps {
  festId: number;
}

export default function Expenses({ festId }: ExpensesProps) {
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [search, setSearch] = useState("");
  const [filterHost, setFilterHost] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  // ANL-06: budgets (keyed by enum) + inline editor state.
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [editingCat, setEditingCat] = useState<string | null>(null); // enum, "__overall__", or null
  const [editVal, setEditVal] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);
  const canEditBudgets = getStoredUser()?.role === "ADMIN";

  const fetchBudgets = async () => {
    try {
      const res = await apiFetch(`${getApiUrl()}/api/events/marketing/fest/${festId}/budgets`);
      const json = await res.json();
      if (res.ok && json.success && Array.isArray(json.data)) setBudgets(json.data);
    } catch {
      /* budgets are optional; ignore */
    }
  };

  // Save (upsert) a budget for a category enum (or null = overall), in paise.
  const saveBudget = async (category: string | null, amountPaise: number) => {
    setSavingBudget(true);
    try {
      const res = await apiFetch(`${getApiUrl()}/api/events/marketing/fest/${festId}/budgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, amount: amountPaise }),
      });
      if (!res.ok) {
        showToast(res.status === 403 ? "Only the fest admin can set budgets." : "Could not save the budget.", "error");
        return;
      }
      await fetchBudgets();
      setEditingCat(null);
      setEditVal("");
      showToast("Budget saved", "success");
    } catch {
      showToast("Could not save the budget.", "error");
    } finally {
      setSavingBudget(false);
    }
  };

  useEffect(() => {
    const fetchExpenses = async () => {
      try {
        const res = await apiFetch(
          `${getApiUrl()}/api/events/marketing/fest/${festId}/expenses`
        );
        const json = await res.json();
        if (!res.ok || !json.success) return;

        const mapped: Expense[] = json.data.map((ex: any) => {
          const hostName =
            ex.host?.name ||
            ex.host?.email ||
            (ex.hostId ? `Host #${ex.hostId}` : "Unknown host");

          const festName = ex.fest?.name || ex.event?.fest?.name || "Fest";

          const filesOfType = (fileType: string): UploadedFile[] =>
            (ex.files || [])
              .filter((f: any) => f.fileType === fileType)
              .map((f: any) => ({
                name: f.fileName,
                size: f.fileSize || 0,
                type: f.mimeType || "",
                url: f.fileUrl || "",
              }));

          const proofFiles = filesOfType("PROOF");
          const billFiles = filesOfType("BILL");

          return {
            id: ex.id,
            hostName,
            festName,
            description: ex.description,
            category: categoryLabel(ex.category), // normalize enum -> display label
            vendor: ex.vendor,
            amount: ex.amount || 0,
            paymentDate: ex.paymentDate
              ? ex.paymentDate.split("T")[0]
              : "",
            paymentMethod: ex.paymentMethod || "",
            proofFiles,
            billFiles,
            notes: ex.notes || "",
            createdAt: ex.createdAt,
          };
        });

        setAllExpenses(mapped);
      } catch (err) {
        console.error("Failed to load fest expenses:", err);
      }
    };

    fetchExpenses();
  }, [festId]);

  // ANL-06: budgets are secondary — fetched after expenses so the primary list
  // isn't delayed (and so a shared fetch mock resolves expenses first).
  useEffect(() => {
    fetchBudgets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [festId]);

  const uniqueHosts = Array.from(new Set(allExpenses.map((e) => e.hostName)));

  const searchTerm = search.toLowerCase();
  const filteredExpenses = allExpenses.filter((expense) => {
    const matchesSearch =
      expense.description.toLowerCase().includes(searchTerm) ||
      expense.vendor.toLowerCase().includes(searchTerm) ||
      expense.hostName.toLowerCase().includes(searchTerm);
    const matchesHost = filterHost === "all" || expense.hostName === filterHost;
    const matchesCategory = filterCategory === "all" || expense.category === filterCategory;
    return matchesSearch && matchesHost && matchesCategory;
  });

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  const expensesByCategory = expenseCategories.map((cat) => ({
    category: cat,
    total: filteredExpenses
      .filter((e) => e.category === cat)
      .reduce((sum, e) => sum + e.amount, 0),
  })).filter((c) => c.total > 0);

  // ANL-06: budgets keyed by enum, plus the overall (category=null) budget and the
  // true (unfiltered) total spend for the overall budget bar.
  const budgetByEnum = new Map(budgets.filter((b) => b.category != null).map((b) => [b.category, b.amount]));
  const overallBudget = budgets.find((b) => b.category == null)?.amount ?? null;
  const overallActual = allExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Budget-vs-actual must use the TRUE (unfiltered) category spend, not the
  // search/host-filtered totals (which would misreport over-budget when a filter
  // is active). Also surface categories that have a budget but no spend yet, so
  // their budget is visible/editable.
  const spendByLabel = new Map<string, number>();
  for (const e of allExpenses) spendByLabel.set(e.category, (spendByLabel.get(e.category) ?? 0) + e.amount);
  const budgetedLabels = new Set(
    budgets.filter((b) => b.category != null).map((b) => categoryLabel(b.category as string))
  );
  const budgetCards = expenseCategories
    // Show a card when it has spend or a budget; admins (who can set budgets) see
    // every category so a budget can be created even before any spend.
    .filter((label) => (spendByLabel.get(label) ?? 0) > 0 || budgetedLabels.has(label) || canEditBudgets)
    .map((label) => ({ category: label, actual: spendByLabel.get(label) ?? 0 }));

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Infrastructure": return "bg-blue-100 text-blue-700";
      case "Marketing": return "bg-green-100 text-green-700";
      // `purple` is a flat brand override in tailwind.config (no numbered scale),
      // so bg-purple-100/text-purple-700 emit nothing — use the default violet scale.
      case "Artist Fees": return "bg-violet-100 text-violet-700";
      case "Catering": return "bg-orange-100 text-orange-700";
      case "Transportation": return "bg-yellow-100 text-yellow-700";
      case "Security": return "bg-red-100 text-red-700";
      case "Decoration": return "bg-pink-100 text-pink-700";
      case "Sound & AV": return "bg-indigo-100 text-indigo-700";
      case "Prizes": return "bg-amber-100 text-amber-700";
      default: return "bg-[var(--surface-slate)] text-[var(--text-strong)]";
    }
  };

  // Generate + download a CSV of the currently-filtered rows.
  const handleExportCsv = () => {
    const headers = [
      "Host",
      "Fest",
      "Description",
      "Category",
      "Vendor",
      "Amount (₹)",
      "Payment Date",
      "Payment Method",
      "Notes",
    ];
    const rows = filteredExpenses.map((e) => [
      e.hostName,
      e.festName,
      e.description,
      e.category,
      e.vendor,
      // amount is integer paise (PAY-03) — export rupees, else the CSV is 100× too big.
      paiseToRupeeString(e.amount),
      e.paymentDate,
      e.paymentMethod,
      e.notes,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fest-${festId}-expenses.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border-card)] p-4 shadow-sm">
          <p className="text-sm text-[var(--text-muted)]">Total Expenses</p>
          <p className="text-2xl font-bold text-red-600">{formatPaise(totalExpenses)}</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border-card)] p-4 shadow-sm">
          <p className="text-sm text-[var(--text-muted)]">Total Entries</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{filteredExpenses.length}</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border-card)] p-4 shadow-sm">
          <p className="text-sm text-[var(--text-muted)]">Hosts Reporting</p>
          <p className="text-2xl font-bold text-[var(--text-secondary)]">{uniqueHosts.length}</p>
        </div>
        <div className="bg-[var(--surface)] rounded-xl border border-[var(--border-card)] p-4 shadow-sm">
          <p className="text-sm text-[var(--text-muted)]">Categories Used</p>
          <p className="text-2xl font-bold text-[var(--text-primary)]">{expensesByCategory.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border-card)] p-4 shadow-sm">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <svg
              aria-hidden="true"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              aria-label="Search expenses by description, vendor, or host"
              placeholder="Search by description, vendor, or host..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[var(--border-card)] bg-[var(--surface)] text-sm focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)]"
            />
          </div>

          {/* Host Filter */}
          <select
            aria-label="Filter by host"
            value={filterHost}
            onChange={(e) => setFilterHost(e.target.value)}
            className="px-4 py-2.5 rounded-lg border border-[var(--border-card)] bg-[var(--surface)] text-sm focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)]"
          >
            <option value="all">All Hosts</option>
            {uniqueHosts.map((host) => (
              <option key={host} value={host}>
                {host}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            aria-label="Filter by category"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2.5 rounded-lg border border-[var(--border-card)] bg-[var(--surface)] text-sm focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)]"
          >
            <option value="all">All Categories</option>
            {expenseCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Expenses List */}
        <div className="lg:col-span-2 bg-[var(--surface)] rounded-2xl border border-[var(--border-card)] overflow-hidden shadow-sm">
          <div className="px-6 py-5 border-b border-[var(--border-card)] flex items-center justify-between">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">All Host Expenses</h3>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredExpenses.length === 0}
              className="px-4 py-2 bg-[color-mix(in_srgb,var(--surface-card)_30%,transparent)] hover:bg-[var(--surface-card)] rounded-lg text-sm font-medium transition-colors flex items-center gap-2 text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg aria-hidden="true" className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Export CSV
            </button>
          </div>

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-[color-mix(in_srgb,var(--surface-card)_20%,transparent)]">
                <tr>
                  <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-muted)]">Host</th>
                  <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-muted)]">Description</th>
                  <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-muted)]">Category</th>
                  <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-muted)]">Amount</th>
                  <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-muted)]">Date</th>
                  <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[var(--text-muted)]">Files</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-card)]">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-[var(--text-muted)]">
                      No expenses found matching your filters
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((expense) => (
                    <tr
                      key={expense.id}
                      onClick={() => setSelectedExpense(expense)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedExpense(expense);
                        }
                      }}
                      tabIndex={0}
                      aria-label={`View details for expense ${expense.description}`}
                      className={`hover:bg-[color-mix(in_srgb,var(--surface-card)_10%,transparent)] transition-colors cursor-pointer ${
                        selectedExpense?.id === expense.id ? "bg-[color-mix(in_srgb,var(--fill-plum)_5%,transparent)]" : ""
                      }`}
                    >
                      <td className="px-6 py-4">
                        <p className="font-medium text-[var(--text-primary)]">{expense.hostName}</p>
                        <p className="text-xs text-[var(--text-muted)]">{expense.festName}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[var(--text-primary)] max-w-[180px] truncate">{expense.description}</p>
                        <p className="text-xs text-[var(--text-muted)]">{expense.vendor}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(expense.category)}`}>
                          {expense.category}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-red-600 font-bold">{formatPaise(expense.amount)}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-[var(--text-muted)]">
                        {new Date(expense.paymentDate).toLocaleDateString("en-GB")}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          {expense.proofFiles.length > 0 && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                              {expense.proofFiles.length} proof
                            </span>
                          )}
                          {expense.billFiles.length > 0 && (
                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                              {expense.billFiles.length} bill
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Expense Details Panel */}
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border-card)] p-6 shadow-sm h-fit">
          {selectedExpense ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[var(--text-primary)] text-lg">Expense Details</h3>
                <button
                  onClick={() => setSelectedExpense(null)}
                  aria-label="Close expense details"
                  className="p-1 hover:bg-[color-mix(in_srgb,var(--surface-card)_30%,transparent)] rounded transition"
                >
                  <svg aria-hidden="true" className="w-5 h-5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-xs text-[var(--text-muted)]">Description</p>
                  <p className="font-semibold text-[var(--text-primary)]">{selectedExpense.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Host</p>
                    <p className="text-[var(--text-primary)]">{selectedExpense.hostName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Fest</p>
                    <p className="text-[var(--text-primary)]">{selectedExpense.festName}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Vendor</p>
                    <p className="text-[var(--text-primary)]">{selectedExpense.vendor}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Category</p>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(selectedExpense.category)}`}>
                      {selectedExpense.category}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Amount</p>
                    <p className="text-xl font-bold text-red-600">{formatPaise(selectedExpense.amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Payment Date</p>
                    <p className="text-[var(--text-primary)]">{new Date(selectedExpense.paymentDate).toLocaleDateString("en-GB")}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-[var(--text-muted)]">Payment Method</p>
                  <p className="text-[var(--text-primary)]">{selectedExpense.paymentMethod}</p>
                </div>

                {selectedExpense.notes && (
                  <div>
                    <p className="text-xs text-[var(--text-muted)]">Notes</p>
                    <p className="text-[var(--text-primary)] text-sm">{selectedExpense.notes}</p>
                  </div>
                )}

                {/* Proof Files */}
                {selectedExpense.proofFiles.length > 0 && (
                  <div>
                    <p className="text-xs text-[var(--text-muted)] mb-2">Payment Proof</p>
                    <div className="space-y-1">
                      {selectedExpense.proofFiles.map((file, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => file.url && downloadMarketingFile(file.url, file.name)}
                          disabled={!file.url}
                          className={`w-full flex items-center justify-between p-2 bg-green-50 rounded text-sm text-left ${file.url ? "hover:bg-green-100" : "cursor-default"}`}
                        >
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="text-green-700 truncate max-w-[150px] underline">{file.name}</span>
                          </div>
                          <span className="text-xs text-green-600">{formatFileSize(file.size)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bill Files */}
                {selectedExpense.billFiles.length > 0 && (
                  <div>
                    <p className="text-xs text-[var(--text-muted)] mb-2">Bills/Invoices</p>
                    <div className="space-y-1">
                      {selectedExpense.billFiles.map((file, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => file.url && downloadMarketingFile(file.url, file.name)}
                          disabled={!file.url}
                          className={`w-full flex items-center justify-between p-2 bg-blue-50 rounded text-sm text-left ${file.url ? "hover:bg-blue-100" : "cursor-default"}`}
                        >
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="text-blue-700 truncate max-w-[150px] underline">{file.name}</span>
                          </div>
                          <span className="text-xs text-blue-600">{formatFileSize(file.size)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[color-mix(in_srgb,var(--surface-card)_30%,transparent)] flex items-center justify-center">
                <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-[var(--text-muted)]">Select an expense to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border-card)] p-6 shadow-sm">
        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">Expenses by Category</h3>

        {/* ANL-06: overall fest budget (category = null) vs total spend. */}
        <div className="mb-5 p-4 rounded-xl bg-[color-mix(in_srgb,var(--surface-card)_20%,transparent)]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--text-primary)]">Overall budget</span>
            <span className="text-sm font-bold text-[var(--text-primary)]">{formatPaise(overallActual)} spent</span>
          </div>
          <BudgetBar
            actual={overallActual}
            budget={overallBudget}
            canEdit={canEditBudgets}
            isEditing={editingCat === "__overall__"}
            editVal={editVal}
            saving={savingBudget}
            onStartEdit={() => {
              setEditingCat("__overall__");
              setEditVal(overallBudget != null ? String(overallBudget / 100) : "");
            }}
            onCancel={() => setEditingCat(null)}
            onChangeVal={setEditVal}
            onSave={(paise) => saveBudget(null, paise)}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {budgetCards.map((cat) => {
            // % of total and budget-vs-actual both use the UNFILTERED category spend.
            const percentage = overallActual > 0 ? (cat.actual / overallActual) * 100 : 0;
            const enumKey = LABEL_TO_ENUM[cat.category];
            const catBudget = enumKey != null ? budgetByEnum.get(enumKey) ?? null : null;
            return (
              <div key={cat.category} className="p-4 rounded-xl bg-[color-mix(in_srgb,var(--surface-card)_20%,transparent)]">
                <span className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(cat.category)}`}>
                  {cat.category}
                </span>
                <p className="text-lg font-bold text-[var(--text-primary)] mt-2">{formatPaise(cat.actual)}</p>
                <div className="w-full h-1.5 bg-[var(--surface-card)] rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full bg-[var(--fill-plum)] rounded-full"
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">{percentage.toFixed(1)}% of total</p>
                {enumKey != null && (
                  <BudgetBar
                    actual={cat.actual}
                    budget={catBudget}
                    canEdit={canEditBudgets}
                    isEditing={editingCat === enumKey}
                    editVal={editVal}
                    saving={savingBudget}
                    onStartEdit={() => {
                      setEditingCat(enumKey);
                      setEditVal(catBudget != null ? String(catBudget / 100) : "");
                    }}
                    onCancel={() => setEditingCat(null)}
                    onChangeVal={setEditVal}
                    onSave={(paise) => saveBudget(enumKey, paise)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
