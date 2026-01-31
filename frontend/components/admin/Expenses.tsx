"use client";

import { useState } from "react";

interface UploadedFile {
  name: string;
  size: number;
  type: string;
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

// Sample data - aggregated from all hosts' marketing pages
const allExpenses: Expense[] = [
  {
    id: 1,
    hostName: "Rahul Menon",
    festName: "Tathva 2025",
    description: "Stage Setup & Lighting",
    category: "Infrastructure",
    vendor: "EventPro Services",
    amount: 150000,
    paymentDate: "2025-01-18",
    paymentMethod: "Bank Transfer",
    proofFiles: [{ name: "payment_receipt.pdf", size: 245000, type: "application/pdf" }],
    billFiles: [{ name: "stage_invoice.pdf", size: 189000, type: "application/pdf" }],
    notes: "Advance payment for Proshow stage",
    createdAt: "2025-01-18",
  },
  {
    id: 2,
    hostName: "Rahul Menon",
    festName: "Tathva 2025",
    description: "Marketing Banners & Posters",
    category: "Marketing",
    vendor: "PrintMax",
    amount: 25000,
    paymentDate: "2025-01-16",
    paymentMethod: "UPI",
    proofFiles: [{ name: "upi_screenshot.png", size: 156000, type: "image/png" }],
    billFiles: [{ name: "printmax_bill.pdf", size: 98000, type: "application/pdf" }],
    notes: "500 posters + 20 flex banners",
    createdAt: "2025-01-16",
  },
  {
    id: 3,
    hostName: "Priya Nair",
    festName: "Tathva 2025",
    description: "DJ Performance Fee",
    category: "Artist Fees",
    vendor: "DJ Sunburn Agency",
    amount: 200000,
    paymentDate: "2025-01-15",
    paymentMethod: "Bank Transfer - NEFT/RTGS",
    proofFiles: [{ name: "neft_receipt.pdf", size: 180000, type: "application/pdf" }],
    billFiles: [{ name: "artist_contract.pdf", size: 320000, type: "application/pdf" }],
    notes: "50% advance for Proshow Day 2",
    createdAt: "2025-01-15",
  },
  {
    id: 4,
    hostName: "Arun Kumar",
    festName: "Tathva 2025",
    description: "Sound System Rental",
    category: "Sound & AV",
    vendor: "AudioTech Solutions",
    amount: 85000,
    paymentDate: "2025-01-14",
    paymentMethod: "Cheque",
    proofFiles: [{ name: "cheque_photo.jpg", size: 210000, type: "image/jpeg" }],
    billFiles: [{ name: "audio_quotation.pdf", size: 145000, type: "application/pdf" }],
    notes: "Main stage sound for 3 days",
    createdAt: "2025-01-14",
  },
  {
    id: 5,
    hostName: "Sneha Thomas",
    festName: "Tathva 2025",
    description: "Catering for Participants",
    category: "Catering",
    vendor: "Tasty Bites Catering",
    amount: 65000,
    paymentDate: "2025-01-12",
    paymentMethod: "UPI",
    proofFiles: [{ name: "gpay_screenshot.png", size: 125000, type: "image/png" }],
    billFiles: [{ name: "catering_bill.pdf", size: 95000, type: "application/pdf" }],
    notes: "Hackathon meals - 150 participants x 3 days",
    createdAt: "2025-01-12",
  },
  {
    id: 6,
    hostName: "Mohammed Faisal",
    festName: "Tathva 2025",
    description: "Security Personnel",
    category: "Security",
    vendor: "SafeGuard Services",
    amount: 45000,
    paymentDate: "2025-01-10",
    paymentMethod: "Bank Transfer",
    proofFiles: [{ name: "bank_statement.pdf", size: 198000, type: "application/pdf" }],
    billFiles: [{ name: "security_agreement.pdf", size: 256000, type: "application/pdf" }],
    notes: "30 security guards for all 4 days",
    createdAt: "2025-01-10",
  },
  {
    id: 7,
    hostName: "Anjali Krishnan",
    festName: "Tathva 2025",
    description: "Stage Decorations",
    category: "Decoration",
    vendor: "Creative Decors",
    amount: 35000,
    paymentDate: "2025-01-08",
    paymentMethod: "Cash",
    proofFiles: [{ name: "cash_receipt.jpg", size: 110000, type: "image/jpeg" }],
    billFiles: [{ name: "decor_estimate.pdf", size: 87000, type: "application/pdf" }],
    notes: "Cultural night stage setup",
    createdAt: "2025-01-08",
  },
  {
    id: 8,
    hostName: "Rahul Menon",
    festName: "Tathva 2025",
    description: "Transportation - Equipment",
    category: "Transportation",
    vendor: "FastMove Logistics",
    amount: 18000,
    paymentDate: "2025-01-06",
    paymentMethod: "UPI",
    proofFiles: [{ name: "phonepe_ss.png", size: 95000, type: "image/png" }],
    billFiles: [{ name: "transport_bill.pdf", size: 68000, type: "application/pdf" }],
    notes: "Sound equipment from Chennai",
    createdAt: "2025-01-06",
  },
  {
    id: 9,
    hostName: "Priya Nair",
    festName: "Tathva 2025",
    description: "Prizes & Trophies",
    category: "Prizes",
    vendor: "Trophy World",
    amount: 28000,
    paymentDate: "2025-01-05",
    paymentMethod: "Credit Card",
    proofFiles: [{ name: "card_statement.pdf", size: 142000, type: "application/pdf" }],
    billFiles: [{ name: "trophy_invoice.pdf", size: 78000, type: "application/pdf" }],
    notes: "Competition prizes for all events",
    createdAt: "2025-01-05",
  },
  {
    id: 10,
    hostName: "Arun Kumar",
    festName: "Tathva 2025",
    description: "Miscellaneous Supplies",
    category: "Miscellaneous",
    vendor: "Various Vendors",
    amount: 12000,
    paymentDate: "2025-01-03",
    paymentMethod: "Cash",
    proofFiles: [],
    billFiles: [{ name: "misc_bills.pdf", size: 234000, type: "application/pdf" }],
    notes: "Cables, tapes, stationery etc.",
    createdAt: "2025-01-03",
  },
];

const expenseCategories = [
  "Infrastructure",
  "Marketing",
  "Artist Fees",
  "Catering",
  "Transportation",
  "Security",
  "Decoration",
  "Sound & AV",
  "Prizes",
  "Miscellaneous",
];

export default function Expenses() {
  const [search, setSearch] = useState("");
  const [filterHost, setFilterHost] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  const uniqueHosts = Array.from(new Set(allExpenses.map((e) => e.hostName)));

  const filteredExpenses = allExpenses.filter((expense) => {
    const matchesSearch =
      expense.description.toLowerCase().includes(search.toLowerCase()) ||
      expense.vendor.toLowerCase().includes(search.toLowerCase()) ||
      expense.hostName.toLowerCase().includes(search.toLowerCase());
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

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "Infrastructure": return "bg-blue-100 text-blue-700";
      case "Marketing": return "bg-green-100 text-green-700";
      case "Artist Fees": return "bg-purple-100 text-purple-700";
      case "Catering": return "bg-orange-100 text-orange-700";
      case "Transportation": return "bg-yellow-100 text-yellow-700";
      case "Security": return "bg-red-100 text-red-700";
      case "Decoration": return "bg-pink-100 text-pink-700";
      case "Sound & AV": return "bg-indigo-100 text-indigo-700";
      case "Prizes": return "bg-amber-100 text-amber-700";
      default: return "bg-gray-100 text-gray-700";
    }
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
        <div className="bg-white rounded-xl border border-[#C5BAC4] p-4 shadow-sm">
          <p className="text-sm text-[#6B597F]">Total Expenses</p>
          <p className="text-2xl font-bold text-red-600">₹{totalExpenses.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#C5BAC4] p-4 shadow-sm">
          <p className="text-sm text-[#6B597F]">Total Entries</p>
          <p className="text-2xl font-bold text-[#29104A]">{filteredExpenses.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#C5BAC4] p-4 shadow-sm">
          <p className="text-sm text-[#6B597F]">Hosts Reporting</p>
          <p className="text-2xl font-bold text-[#522C5D]">{uniqueHosts.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#C5BAC4] p-4 shadow-sm">
          <p className="text-sm text-[#6B597F]">Categories Used</p>
          <p className="text-2xl font-bold text-[#29104A]">{expensesByCategory.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#C5BAC4] p-4 shadow-sm">
        <div className="flex flex-wrap gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B597F]"
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
              placeholder="Search by description, vendor, or host..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[#C5BAC4] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#522C5D]/20"
            />
          </div>

          {/* Host Filter */}
          <select
            value={filterHost}
            onChange={(e) => setFilterHost(e.target.value)}
            className="px-4 py-2.5 rounded-lg border border-[#C5BAC4] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#522C5D]/20"
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
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2.5 rounded-lg border border-[#C5BAC4] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#522C5D]/20"
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
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#C5BAC4] overflow-hidden shadow-sm">
          <div className="px-6 py-5 border-b border-[#C5BAC4] flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#29104A]">All Host Expenses</h3>
            <button className="px-4 py-2 bg-[#C5BAC4]/30 hover:bg-[#C5BAC4] rounded-lg text-sm font-medium transition-colors flex items-center gap-2 text-[#29104A]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              <thead className="sticky top-0 bg-[#C5BAC4]/20">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Host</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Description</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Category</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Amount</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Date</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Files</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#C5BAC4]">
                {filteredExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-[#6B597F]">
                      No expenses found matching your filters
                    </td>
                  </tr>
                ) : (
                  filteredExpenses.map((expense) => (
                    <tr
                      key={expense.id}
                      onClick={() => setSelectedExpense(expense)}
                      className={`hover:bg-[#C5BAC4]/10 transition-colors cursor-pointer ${
                        selectedExpense?.id === expense.id ? "bg-[#522C5D]/5" : ""
                      }`}
                    >
                      <td className="px-6 py-4">
                        <p className="font-medium text-[#29104A]">{expense.hostName}</p>
                        <p className="text-xs text-[#6B597F]">{expense.festName}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[#29104A] max-w-[180px] truncate">{expense.description}</p>
                        <p className="text-xs text-[#6B597F]">{expense.vendor}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(expense.category)}`}>
                          {expense.category}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-red-600 font-bold">₹{expense.amount.toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-[#6B597F]">
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
        <div className="bg-white rounded-2xl border border-[#C5BAC4] p-6 shadow-sm h-fit">
          {selectedExpense ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-[#29104A] text-lg">Expense Details</h3>
                <button
                  onClick={() => setSelectedExpense(null)}
                  className="p-1 hover:bg-[#C5BAC4]/30 rounded transition"
                >
                  <svg className="w-5 h-5 text-[#6B597F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <p className="text-xs text-[#6B597F]">Description</p>
                  <p className="font-semibold text-[#29104A]">{selectedExpense.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-[#6B597F]">Host</p>
                    <p className="text-[#29104A]">{selectedExpense.hostName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#6B597F]">Fest</p>
                    <p className="text-[#29104A]">{selectedExpense.festName}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-[#6B597F]">Vendor</p>
                    <p className="text-[#29104A]">{selectedExpense.vendor}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#6B597F]">Category</p>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(selectedExpense.category)}`}>
                      {selectedExpense.category}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-[#6B597F]">Amount</p>
                    <p className="text-xl font-bold text-red-600">₹{selectedExpense.amount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#6B597F]">Payment Date</p>
                    <p className="text-[#29104A]">{new Date(selectedExpense.paymentDate).toLocaleDateString("en-GB")}</p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-[#6B597F]">Payment Method</p>
                  <p className="text-[#29104A]">{selectedExpense.paymentMethod}</p>
                </div>

                {selectedExpense.notes && (
                  <div>
                    <p className="text-xs text-[#6B597F]">Notes</p>
                    <p className="text-[#29104A] text-sm">{selectedExpense.notes}</p>
                  </div>
                )}

                {/* Proof Files */}
                {selectedExpense.proofFiles.length > 0 && (
                  <div>
                    <p className="text-xs text-[#6B597F] mb-2">Payment Proof</p>
                    <div className="space-y-1">
                      {selectedExpense.proofFiles.map((file, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-green-50 rounded text-sm">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="text-green-700 truncate max-w-[150px]">{file.name}</span>
                          </div>
                          <span className="text-xs text-green-600">{formatFileSize(file.size)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bill Files */}
                {selectedExpense.billFiles.length > 0 && (
                  <div>
                    <p className="text-xs text-[#6B597F] mb-2">Bills/Invoices</p>
                    <div className="space-y-1">
                      {selectedExpense.billFiles.map((file, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-blue-50 rounded text-sm">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="text-blue-700 truncate max-w-[150px]">{file.name}</span>
                          </div>
                          <span className="text-xs text-blue-600">{formatFileSize(file.size)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#C5BAC4]/30 flex items-center justify-center">
                <svg className="w-8 h-8 text-[#6B597F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-[#6B597F]">Select an expense to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="bg-white rounded-2xl border border-[#C5BAC4] p-6 shadow-sm">
        <h3 className="text-lg font-bold text-[#29104A] mb-4">Expenses by Category</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {expensesByCategory.map((cat) => {
            const percentage = totalExpenses > 0 ? (cat.total / totalExpenses) * 100 : 0;
            return (
              <div key={cat.category} className="p-4 rounded-xl bg-[#C5BAC4]/20">
                <span className={`px-2 py-1 rounded text-xs font-medium ${getCategoryColor(cat.category)}`}>
                  {cat.category}
                </span>
                <p className="text-lg font-bold text-[#29104A] mt-2">₹{cat.total.toLocaleString()}</p>
                <div className="w-full h-1.5 bg-[#C5BAC4] rounded-full mt-2 overflow-hidden">
                  <div
                    className="h-full bg-[#522C5D] rounded-full"
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
                <p className="text-xs text-[#6B597F] mt-1">{percentage.toFixed(1)}% of total</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}