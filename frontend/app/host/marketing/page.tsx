"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

interface UploadedFile {
  name: string;
  size: number;
  type: string;
}

interface SponsorEntry {
  id: number;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  sponsorshipAmount: number;
  receivedAmount: number;
  status: "confirmed" | "pending" | "negotiating";
  notes: string;
  createdAt: string;
}

interface ExpenseEntry {
  id: number;
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

// Sample data
const sampleSponsors: SponsorEntry[] = [
  {
    id: 1,
    companyName: "TechCorp Industries",
    contactPerson: "John Smith",
    email: "john@techcorp.com",
    phone: "+91 98765 43210",
    sponsorshipAmount: 500000,
    receivedAmount: 500000,
    status: "confirmed",
    notes: "Title sponsor for Proshow",
    createdAt: "2025-01-15",
  },
  {
    id: 2,
    companyName: "StartupHub",
    contactPerson: "Priya Sharma",
    email: "priya@startuphub.io",
    phone: "+91 87654 32109",
    sponsorshipAmount: 200000,
    receivedAmount: 100000,
    status: "pending",
    notes: "Awaiting second installment",
    createdAt: "2025-01-10",
  },
];

const sampleExpenses: ExpenseEntry[] = [
  {
    id: 1,
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

const paymentMethods = [
  "Bank Transfer - NEFT/RTGS",
  "UPI",
  "Cash",
  "Cheque",
  "Credit Card",
  "Other",
];

export default function MarketingPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"sponsors" | "expenses">("sponsors");
  const [sponsors, setSponsors] = useState<SponsorEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [showSponsorForm, setShowSponsorForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingSponsor, setEditingSponsor] = useState<SponsorEntry | null>(null);
  const [editingExpense, setEditingExpense] = useState<ExpenseEntry | null>(null);

  // Sponsor form state
  const [sponsorForm, setSponsorForm] = useState({
    companyName: "",
    contactPerson: "",
    email: "",
    phone: "",
    sponsorshipAmount: "",
    receivedAmount: "",
    status: "pending" as "confirmed" | "pending" | "negotiating",
    notes: "",
  });

  // Expense form state
  const [expenseForm, setExpenseForm] = useState({
    description: "",
    category: "",
    vendor: "",
    amount: "",
    paymentDate: "",
    paymentMethod: "",
    notes: "",
  });
  const [proofFiles, setProofFiles] = useState<UploadedFile[]>([]);
  const [billFiles, setBillFiles] = useState<UploadedFile[]>([]);

  useEffect(() => {
    // TODO: Replace with API call
    setSponsors(sampleSponsors);
    setExpenses(sampleExpenses);
    setLoading(false);
  }, []);

  // File handling
  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
    currentFiles: UploadedFile[]
  ) => {
    const files = e.target.files;
    if (files) {
      const newFiles: UploadedFile[] = Array.from(files).map(file => ({
        name: file.name,
        size: file.size,
        type: file.type,
      }));
      setFiles([...currentFiles, ...newFiles]);
    }
    e.target.value = '';
  };

  const removeFile = (
    index: number,
    setFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
    currentFiles: UploadedFile[]
  ) => {
    setFiles(currentFiles.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // Sponsor handlers
  const resetSponsorForm = () => {
    setSponsorForm({
      companyName: "",
      contactPerson: "",
      email: "",
      phone: "",
      sponsorshipAmount: "",
      receivedAmount: "",
      status: "pending",
      notes: "",
    });
    setEditingSponsor(null);
  };

  const handleSponsorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingSponsor) {
      setSponsors(sponsors.map(s => 
        s.id === editingSponsor.id 
          ? {
              ...s,
              ...sponsorForm,
              sponsorshipAmount: parseFloat(sponsorForm.sponsorshipAmount) || 0,
              receivedAmount: parseFloat(sponsorForm.receivedAmount) || 0,
            }
          : s
      ));
    } else {
      const newSponsor: SponsorEntry = {
        id: Date.now(),
        ...sponsorForm,
        sponsorshipAmount: parseFloat(sponsorForm.sponsorshipAmount) || 0,
        receivedAmount: parseFloat(sponsorForm.receivedAmount) || 0,
        createdAt: new Date().toISOString().split('T')[0],
      };
      setSponsors([newSponsor, ...sponsors]);
    }
    
    setShowSponsorForm(false);
    resetSponsorForm();
  };

  const handleEditSponsor = (sponsor: SponsorEntry) => {
    setSponsorForm({
      companyName: sponsor.companyName,
      contactPerson: sponsor.contactPerson,
      email: sponsor.email,
      phone: sponsor.phone,
      sponsorshipAmount: sponsor.sponsorshipAmount.toString(),
      receivedAmount: sponsor.receivedAmount.toString(),
      status: sponsor.status,
      notes: sponsor.notes,
    });
    setEditingSponsor(sponsor);
    setShowSponsorForm(true);
  };

  const handleDeleteSponsor = (id: number) => {
    if (confirm("Are you sure you want to delete this sponsor entry?")) {
      setSponsors(sponsors.filter(s => s.id !== id));
    }
  };

  // Expense handlers
  const resetExpenseForm = () => {
    setExpenseForm({
      description: "",
      category: "",
      vendor: "",
      amount: "",
      paymentDate: "",
      paymentMethod: "",
      notes: "",
    });
    setProofFiles([]);
    setBillFiles([]);
    setEditingExpense(null);
  };

  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingExpense) {
      setExpenses(expenses.map(ex => 
        ex.id === editingExpense.id 
          ? {
              ...ex,
              ...expenseForm,
              amount: parseFloat(expenseForm.amount) || 0,
              proofFiles,
              billFiles,
            }
          : ex
      ));
    } else {
      const newExpense: ExpenseEntry = {
        id: Date.now(),
        ...expenseForm,
        amount: parseFloat(expenseForm.amount) || 0,
        proofFiles,
        billFiles,
        createdAt: new Date().toISOString().split('T')[0],
      };
      setExpenses([newExpense, ...expenses]);
    }
    
    setShowExpenseForm(false);
    resetExpenseForm();
  };

  const handleEditExpense = (expense: ExpenseEntry) => {
    setExpenseForm({
      description: expense.description,
      category: expense.category,
      vendor: expense.vendor,
      amount: expense.amount.toString(),
      paymentDate: expense.paymentDate,
      paymentMethod: expense.paymentMethod,
      notes: expense.notes,
    });
    setProofFiles(expense.proofFiles);
    setBillFiles(expense.billFiles);
    setEditingExpense(expense);
    setShowExpenseForm(true);
  };

  const handleDeleteExpense = (id: number) => {
    if (confirm("Are you sure you want to delete this expense entry?")) {
      setExpenses(expenses.filter(ex => ex.id !== id));
    }
  };

  // Stats
  const totalSponsorshipAmount = sponsors.reduce((sum, s) => sum + s.sponsorshipAmount, 0);
  const totalReceivedAmount = sponsors.reduce((sum, s) => sum + s.receivedAmount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netBalance = totalReceivedAmount - totalExpenses;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "bg-green-100 text-green-700";
      case "pending": return "bg-yellow-100 text-yellow-700";
      case "negotiating": return "bg-blue-100 text-blue-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-[#fdfdff]">
        <Header />
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-[#C5BAC4] rounded w-48"></div>
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-[#C5BAC4] rounded-xl"></div>
              ))}
            </div>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fdfdff] text-[#29104A]">
      <Header />
      
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <button
                onClick={() => router.push("/host/dashboard")}
                className="p-1.5 hover:bg-[#C5BAC4]/30 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-[#6B597F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-[#29104A]">Marketing & Expenses</h1>
            </div>
            <p className="text-[#6B597F] ml-9">Track sponsors, expenses, and payment proofs</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-white border border-[#C5BAC4] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#6B597F] text-sm">Total Sponsorship</span>
              <div className="w-10 h-10 rounded-xl bg-[#522C5D]/10 flex items-center justify-center">
                <svg className="w-5 h-5 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-[#29104A]">₹{totalSponsorshipAmount.toLocaleString()}</p>
            <p className="text-xs text-[#6B597F] mt-1">Committed amount</p>
          </div>

          <div className="bg-white border border-[#C5BAC4] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#6B597F] text-sm">Amount Received</span>
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-green-600">₹{totalReceivedAmount.toLocaleString()}</p>
            <p className="text-xs text-[#6B597F] mt-1">From sponsors</p>
          </div>

          <div className="bg-white border border-[#C5BAC4] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#6B597F] text-sm">Total Expenses</span>
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-red-500">₹{totalExpenses.toLocaleString()}</p>
            <p className="text-xs text-[#6B597F] mt-1">Out of pocket</p>
          </div>

          <div className="bg-white border border-[#C5BAC4] rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[#6B597F] text-sm">Net Balance</span>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${netBalance >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                <svg className={`w-5 h-5 ${netBalance >= 0 ? 'text-green-600' : 'text-red-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className={`text-3xl font-bold ${netBalance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {netBalance >= 0 ? '+' : ''}₹{netBalance.toLocaleString()}
            </p>
            <p className="text-xs text-[#6B597F] mt-1">Received - Expenses</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-[#C5BAC4] overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-[#C5BAC4] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("sponsors")}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "sponsors"
                    ? "bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white"
                    : "bg-[#C5BAC4]/30 text-[#6B597F] hover:bg-[#C5BAC4]"
                }`}
              >
                Sponsors ({sponsors.length})
              </button>
              <button
                onClick={() => setActiveTab("expenses")}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === "expenses"
                    ? "bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white"
                    : "bg-[#C5BAC4]/30 text-[#6B597F] hover:bg-[#C5BAC4]"
                }`}
              >
                Expenses ({expenses.length})
              </button>
            </div>
            <button
              onClick={() => {
                if (activeTab === "sponsors") {
                  resetSponsorForm();
                  setShowSponsorForm(true);
                } else {
                  resetExpenseForm();
                  setShowExpenseForm(true);
                }
              }}
              className="px-4 py-2.5 bg-gradient-to-r from-[#29104A] via-[#3D1B5C] to-[#1A4B6E] text-white rounded-lg font-semibold hover:opacity-90 transition-all flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add {activeTab === "sponsors" ? "Sponsor" : "Expense"}
            </button>
          </div>

          {/* Sponsors Tab */}
          {activeTab === "sponsors" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#C5BAC4]/20">
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Company</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Contact</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Amount</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Received</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Status</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#C5BAC4]">
                  {sponsors.map((sponsor) => (
                    <tr key={sponsor.id} className="hover:bg-[#C5BAC4]/10 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-[#29104A]">{sponsor.companyName}</p>
                        <p className="text-xs text-[#6B597F] mt-0.5">{sponsor.notes}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[#29104A]">{sponsor.contactPerson}</p>
                        <p className="text-xs text-[#6B597F]">{sponsor.email}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-[#29104A]">₹{sponsor.sponsorshipAmount.toLocaleString()}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-green-600">₹{sponsor.receivedAmount.toLocaleString()}</p>
                        {sponsor.receivedAmount < sponsor.sponsorshipAmount && (
                          <p className="text-xs text-yellow-600">
                            Pending: ₹{(sponsor.sponsorshipAmount - sponsor.receivedAmount).toLocaleString()}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium capitalize ${getStatusColor(sponsor.status)}`}>
                          {sponsor.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditSponsor(sponsor)}
                            className="p-2 hover:bg-[#C5BAC4]/30 rounded-lg transition-colors"
                          >
                            <svg className="w-4 h-4 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteSponsor(sponsor.id)}
                            className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                          >
                            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {sponsors.length === 0 && (
                <div className="px-6 py-12 text-center">
                  <p className="text-[#6B597F]">No sponsors added yet</p>
                </div>
              )}
            </div>
          )}

          {/* Expenses Tab */}
          {activeTab === "expenses" && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#C5BAC4]/20">
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Description</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Category</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Vendor</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Amount</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Date</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Files</th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#C5BAC4]">
                  {expenses.map((expense) => (
                    <tr key={expense.id} className="hover:bg-[#C5BAC4]/10 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-semibold text-[#29104A]">{expense.description}</p>
                        <p className="text-xs text-[#6B597F] mt-0.5">{expense.notes}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-[#C5BAC4]/30 rounded text-xs text-[#522C5D]">
                          {expense.category}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[#29104A]">{expense.vendor}</p>
                        <p className="text-xs text-[#6B597F]">{expense.paymentMethod}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-red-500">₹{expense.amount.toLocaleString()}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-[#29104A]">{expense.paymentDate}</p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {expense.proofFiles.length > 0 && (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                              {expense.proofFiles.length} proof
                            </span>
                          )}
                          {expense.billFiles.length > 0 && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
                              {expense.billFiles.length} bill
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditExpense(expense)}
                            className="p-2 hover:bg-[#C5BAC4]/30 rounded-lg transition-colors"
                          >
                            <svg className="w-4 h-4 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(expense.id)}
                            className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                          >
                            <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {expenses.length === 0 && (
                <div className="px-6 py-12 text-center">
                  <p className="text-[#6B597F]">No expenses recorded yet</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Sponsor Modal */}
      {showSponsorForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[#C5BAC4] flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-[#29104A]">
                {editingSponsor ? "Edit Sponsor" : "Add Sponsor"}
              </h2>
              <button
                onClick={() => { setShowSponsorForm(false); resetSponsorForm(); }}
                className="p-2 hover:bg-[#C5BAC4]/30 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-[#6B597F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSponsorSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#6B597F] mb-1.5">Company Name *</label>
                <input
                  type="text"
                  required
                  value={sponsorForm.companyName}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, companyName: e.target.value })}
                  className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#6B597F] mb-1.5">Contact Person *</label>
                  <input
                    type="text"
                    required
                    value={sponsorForm.contactPerson}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, contactPerson: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#6B597F] mb-1.5">Phone</label>
                  <input
                    type="tel"
                    value={sponsorForm.phone}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, phone: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#6B597F] mb-1.5">Email</label>
                <input
                  type="email"
                  value={sponsorForm.email}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, email: e.target.value })}
                  className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#6B597F] mb-1.5">Sponsorship Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={sponsorForm.sponsorshipAmount}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, sponsorshipAmount: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#6B597F] mb-1.5">Amount Received (₹)</label>
                  <input
                    type="number"
                    min="0"
                    value={sponsorForm.receivedAmount}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, receivedAmount: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#6B597F] mb-1.5">Status *</label>
                <select
                  required
                  value={sponsorForm.status}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, status: e.target.value as "confirmed" | "pending" | "negotiating" })}
                  className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                >
                  <option value="negotiating">Negotiating</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#6B597F] mb-1.5">Notes</label>
                <textarea
                  value={sponsorForm.notes}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, notes: e.target.value })}
                  className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA] resize-none"
                  rows={2}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowSponsorForm(false); resetSponsorForm(); }}
                  className="flex-1 px-4 py-2.5 border border-[#C5BAC4] text-[#6B597F] rounded-lg hover:bg-[#C5BAC4]/20"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white rounded-lg hover:opacity-90"
                >
                  {editingSponsor ? "Update" : "Add"} Sponsor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Expense Modal */}
      {showExpenseForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[#C5BAC4] flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-bold text-[#29104A]">
                {editingExpense ? "Edit Expense" : "Add Expense"}
              </h2>
              <button
                onClick={() => { setShowExpenseForm(false); resetExpenseForm(); }}
                className="p-2 hover:bg-[#C5BAC4]/30 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-[#6B597F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleExpenseSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#6B597F] mb-1.5">Description *</label>
                <input
                  type="text"
                  required
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                  placeholder="e.g., Stage Setup & Lighting"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#6B597F] mb-1.5">Category *</label>
                  <select
                    required
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                  >
                    <option value="">Select category</option>
                    {expenseCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#6B597F] mb-1.5">Vendor *</label>
                  <input
                    type="text"
                    required
                    value={expenseForm.vendor}
                    onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                    placeholder="Company/Person name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#6B597F] mb-1.5">Amount (₹) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#6B597F] mb-1.5">Payment Date *</label>
                  <input
                    type="date"
                    required
                    value={expenseForm.paymentDate}
                    onChange={(e) => setExpenseForm({ ...expenseForm, paymentDate: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#6B597F] mb-1.5">Payment Method *</label>
                  <select
                    required
                    value={expenseForm.paymentMethod}
                    onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                  >
                    <option value="">Select</option>
                    {paymentMethods.map((method) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Proof of Payment Upload */}
              <div>
                <label className="block text-sm font-medium text-[#6B597F] mb-1.5">Proof of Payment</label>
                <div className="border-2 border-dashed border-[#C5BAC4] rounded-lg p-4 text-center hover:border-[#522C5D] transition-colors bg-[#F9F7FA]">
                  <input
                    type="file"
                    id="proof-upload"
                    multiple
                    onChange={(e) => handleFileUpload(e, setProofFiles, proofFiles)}
                    className="hidden"
                    accept="image/*,.pdf"
                  />
                  <label htmlFor="proof-upload" className="cursor-pointer">
                    <svg className="w-8 h-8 mx-auto text-[#522C5D] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-[#6B597F]">Click to upload payment proof (screenshots, receipts)</p>
                  </label>
                </div>
                {proofFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {proofFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-green-50 rounded text-sm">
                        <span className="text-green-700 truncate">{file.name}</span>
                        <button type="button" onClick={() => removeFile(i, setProofFiles, proofFiles)} className="text-red-500 hover:text-red-700">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bill Upload */}
              <div>
                <label className="block text-sm font-medium text-[#6B597F] mb-1.5">Upload Bill/Invoice</label>
                <div className="border-2 border-dashed border-[#C5BAC4] rounded-lg p-4 text-center hover:border-[#522C5D] transition-colors bg-[#F9F7FA]">
                  <input
                    type="file"
                    id="bill-upload"
                    multiple
                    onChange={(e) => handleFileUpload(e, setBillFiles, billFiles)}
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx"
                  />
                  <label htmlFor="bill-upload" className="cursor-pointer">
                    <svg className="w-8 h-8 mx-auto text-[#522C5D] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm text-[#6B597F]">Click to upload bill/invoice</p>
                  </label>
                </div>
                {billFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {billFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-blue-50 rounded text-sm">
                        <span className="text-blue-700 truncate">{file.name}</span>
                        <button type="button" onClick={() => removeFile(i, setBillFiles, billFiles)} className="text-red-500 hover:text-red-700">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-[#6B597F] mb-1.5">Notes</label>
                <textarea
                  value={expenseForm.notes}
                  onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                  className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA] resize-none"
                  rows={2}
                  placeholder="Additional details..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowExpenseForm(false); resetExpenseForm(); }}
                  className="flex-1 px-4 py-2.5 border border-[#C5BAC4] text-[#6B597F] rounded-lg hover:bg-[#C5BAC4]/20"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white rounded-lg hover:opacity-90"
                >
                  {editingExpense ? "Update" : "Add"} Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <Footer />
    </main>
  );
}
