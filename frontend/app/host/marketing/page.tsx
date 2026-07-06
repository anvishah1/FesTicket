"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getApiUrl, getStoredUser, isAuthenticated, apiFetch } from "@/lib/auth";
import { showToast } from "@/lib/toast";
import { downloadMarketingFile } from "@/lib/files";
import { formatCurrency } from "@/lib/format";

interface UploadedFile {
  name: string;
  size: number;
  type: string;
  // Set for a freshly-picked file (base64 data URI sent to the backend to store).
  dataUrl?: string;
  // Set for a file already stored on the backend (public URL to open it).
  url?: string;
}

// Open a stored marketing file. Uploaded files are served through the
// authenticated, fest-scoped route (not a public /uploads mount), so we fetch
// with the bearer token and open/download the resulting object URL.
async function openMarketingFile(url?: string, name?: string) {
  if (!url) return;
  const ok = await downloadMarketingFile(url, name);
  if (!ok) showToast("Could not open that file (you may not have access).", "error");
}

// Read a File as a base64 data URI so it can be uploaded in a JSON body.
function readFileAsDataUrl(file: File): Promise<UploadedFile> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () =>
      resolve({
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl: reader.result as string,
      });
    reader.readAsDataURL(file);
  });
}

// Serialize an uploaded file for the API. New files carry a dataUrl (backend
// decodes + stores); already-stored files carry a url (kept as-is).
function toFilePayload(f: UploadedFile) {
  return {
    fileName: f.name,
    name: f.name,
    size: f.size,
    type: f.type,
    ...(f.dataUrl ? { dataUrl: f.dataUrl } : {}),
    ...(f.url ? { url: f.url } : {}),
  };
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
  agreementUrl: string;
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
  const user = getStoredUser();
  const hostId = user?.id ?? 0;
  const editorFestId = user?.editorFestId ?? null; // same festID as admin and the fest; links sponsors/expenses to that fest
  const [activeTab, setActiveTab] = useState<"sponsors" | "expenses">("sponsors");
  const [sponsors, setSponsors] = useState<SponsorEntry[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Fest-wide totals used for the summary/Net Balance so income and spend are
  // both scoped to the whole fest (sponsors are fest-wide; expenses used to be
  // summed per-host, which broke the balance on multi-editor fests).
  const [festTotals, setFestTotals] = useState<{
    sponsorship: number;
    received: number;
    expenses: number;
  } | null>(null);
  
  // Modal states
  const [showSponsorForm, setShowSponsorForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingSponsor, setEditingSponsor] = useState<SponsorEntry | null>(null);
  const [editingExpense, setEditingExpense] = useState<ExpenseEntry | null>(null);
  // Guards against double-submit (duplicate rows) while a save is in flight.
  const [sponsorSubmitting, setSponsorSubmitting] = useState(false);
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);

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
  const [agreementFile, setAgreementFile] = useState<UploadedFile | null>(null);

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

  // Map between display text and backend enum for expense categories
  const toBackendExpenseCategory = (label: string) => {
    switch (label) {
      case "Infrastructure": return "INFRASTRUCTURE";
      case "Marketing": return "MARKETING";
      case "Artist Fees": return "ARTIST_FEES";
      case "Catering": return "CATERING";
      case "Transportation": return "TRANSPORTATION";
      case "Security": return "SECURITY";
      case "Decoration": return "DECORATION";
      case "Sound & AV": return "SOUND_AV";
      case "Prizes": return "PRIZES";
      case "Miscellaneous": return "MISCELLANEOUS";
      default: return "MISCELLANEOUS";
    }
  };

  const fromBackendExpenseCategory = (value: string) => {
    switch (value) {
      case "INFRASTRUCTURE": return "Infrastructure";
      case "MARKETING": return "Marketing";
      case "ARTIST_FEES": return "Artist Fees";
      case "CATERING": return "Catering";
      case "TRANSPORTATION": return "Transportation";
      case "SECURITY": return "Security";
      case "DECORATION": return "Decoration";
      case "SOUND_AV": return "Sound & AV";
      case "PRIZES": return "Prizes";
      case "MISCELLANEOUS": return "Miscellaneous";
      default: return value;
    }
  };

  const toBackendSponsorStatus = (status: SponsorEntry["status"]) => {
    switch (status) {
      case "confirmed": return "CONFIRMED";
      case "pending": return "PENDING";
      case "negotiating": 
      default:
        return "NEGOTIATING";
    }
  };

  const fromBackendSponsorStatus = (status: string): SponsorEntry["status"] => {
    switch (status) {
      case "CONFIRMED": return "confirmed";
      case "PENDING": return "pending";
      case "NEGOTIATING":
      default:
        return "negotiating";
    }
  };

  useEffect(() => {
    if (!isAuthenticated() || !user || (user.role !== "EDITOR" && user.role !== "HOST")) {
      router.replace("/signin");
      return;
    }
  }, [router, user]);

  useEffect(() => {
    if (editorFestId == null) return;
    const fetchData = async () => {
      try {
        // Fest-scoped (not host-scoped) so the list matches the fest-wide totals —
        // otherwise a fest sponsor not tied to THIS host's own events is counted in
        // the totals but missing from the list, which is confusing + unmanageable.
        const [sRes, eRes] = await Promise.all([
          apiFetch(`${getApiUrl()}/api/events/marketing/fest/${editorFestId}/sponsors`),
          apiFetch(`${getApiUrl()}/api/events/marketing/fest/${editorFestId}/expenses`),
        ]);

        const sponsorsJson = await sRes.json();
        const expensesJson = await eRes.json();

        if (sRes.ok && sponsorsJson.success) {
          const mappedSponsors: SponsorEntry[] = sponsorsJson.data.map((s: any) => ({
            id: s.id,
            companyName: s.companyName,
            contactPerson: s.contactPerson,
            email: s.email || "",
            phone: s.phone || "",
            sponsorshipAmount: s.sponsorshipAmount || 0,
            receivedAmount: s.receivedAmount || 0,
            status: fromBackendSponsorStatus(s.status),
            notes: s.notes || "",
            agreementUrl: s.agreementUrl || "",
            createdAt: s.createdAt,
          }));
          setSponsors(mappedSponsors);
        }

        if (eRes.ok && expensesJson.success) {
          const mappedExpenses: ExpenseEntry[] = expensesJson.data.map((ex: any) => {
            const proofFiles = (ex.files || []).filter((f: any) => f.fileType === "PROOF").map((f: any) => ({
              name: f.fileName,
              size: f.fileSize || 0,
              type: f.mimeType || "",
              url: f.fileUrl || "",
            }));
            const billFiles = (ex.files || []).filter((f: any) => f.fileType === "BILL").map((f: any) => ({
              name: f.fileName,
              size: f.fileSize || 0,
              type: f.mimeType || "",
              url: f.fileUrl || "",
            }));

            return {
              id: ex.id,
              description: ex.description,
              category: fromBackendExpenseCategory(ex.category),
              vendor: ex.vendor,
              amount: ex.amount || 0,
              paymentDate: ex.paymentDate ? ex.paymentDate.split("T")[0] : "",
              paymentMethod: ex.paymentMethod || "",
              notes: ex.notes || "",
              proofFiles,
              billFiles,
              createdAt: ex.createdAt,
            } as ExpenseEntry;
          });
          setExpenses(mappedExpenses);
        }
      } catch (err) {
        console.error("Failed to fetch marketing data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [editorFestId]);

  // Fest-wide totals for the Net Balance, derived from the (now fest-scoped)
  // sponsors + expenses state — no separate fetch needed, and always consistent
  // with the list the user sees.
  useEffect(() => {
    setFestTotals({
      sponsorship: sponsors.reduce((sum, s) => sum + (s.sponsorshipAmount || 0), 0),
      received: sponsors.reduce((sum, s) => sum + (s.receivedAmount || 0), 0),
      expenses: expenses.reduce((sum, e) => sum + (e.amount || 0), 0),
    });
  }, [sponsors, expenses]);

  // File handling
  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    setFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>,
    currentFiles: UploadedFile[]
  ) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // Read each picked file as a base64 data URI so the backend can store it.
      const newFiles = await Promise.all(Array.from(files).map(readFileAsDataUrl));
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
    setAgreementFile(null);
    setEditingSponsor(null);
  };

  const handleSponsorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sponsorSubmitting) return;

    const payload = {
      companyName: sponsorForm.companyName,
      contactPerson: sponsorForm.contactPerson,
      email: sponsorForm.email || null,
      phone: sponsorForm.phone || null,
      sponsorshipAmount: parseFloat(sponsorForm.sponsorshipAmount) || 0,
      receivedAmount: parseFloat(sponsorForm.receivedAmount) || 0,
      status: toBackendSponsorStatus(sponsorForm.status),
      notes: sponsorForm.notes || null,
      ...(editorFestId != null && { festId: editorFestId }),
      // Only send an agreement when the user picked a NEW file (has a dataUrl);
      // an existing (url-only) file is left untouched on the server.
      ...(agreementFile?.dataUrl
        ? { agreementFile: { fileName: agreementFile.name, dataUrl: agreementFile.dataUrl } }
        : {}),
    };

    setSponsorSubmitting(true);
    let success = false;
    try {
      if (editingSponsor) {
        const res = await apiFetch(`${getApiUrl()}/api/events/marketing/sponsors/${editingSponsor.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.error?.message || "Failed to update sponsor", "error");
        } else {
          const updated: any = data.data;
          setSponsors(sponsors.map((s) =>
            s.id === editingSponsor.id
              ? {
                  id: updated.id,
                  companyName: updated.companyName,
                  contactPerson: updated.contactPerson,
                  email: updated.email || "",
                  phone: updated.phone || "",
                  sponsorshipAmount: updated.sponsorshipAmount || 0,
                  receivedAmount: updated.receivedAmount || 0,
                  status: fromBackendSponsorStatus(updated.status),
                  notes: updated.notes || "",
                  agreementUrl: updated.agreementUrl || "",
                  createdAt: updated.createdAt,
                }
              : s
          ));
          success = true;
        }
      } else {
        const res = await apiFetch(`${getApiUrl()}/api/events/marketing/host/${hostId}/sponsors`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.error?.message || "Failed to create sponsor", "error");
        } else {
          const s: any = data.data;
          const newSponsor: SponsorEntry = {
            id: s.id,
            companyName: s.companyName,
            contactPerson: s.contactPerson,
            email: s.email || "",
            phone: s.phone || "",
            sponsorshipAmount: s.sponsorshipAmount || 0,
            receivedAmount: s.receivedAmount || 0,
            status: fromBackendSponsorStatus(s.status),
            notes: s.notes || "",
            agreementUrl: s.agreementUrl || "",
            createdAt: s.createdAt,
          };
          setSponsors([newSponsor, ...sponsors]);
          success = true;
        }
      }
    } catch (err) {
      console.error("Failed to save sponsor:", err);
      showToast("Failed to save sponsor. Please try again.", "error");
    } finally {
      setSponsorSubmitting(false);
    }

    // Only close + reset on success; on failure keep the modal open with the
    // user's input so they can fix the error and retry.
    if (success) {
      setShowSponsorForm(false);
      resetSponsorForm();
    }
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
    setAgreementFile(sponsor.agreementUrl ? { name: "Current agreement", size: 0, type: "", url: sponsor.agreementUrl } : null);
    setEditingSponsor(sponsor);
    setShowSponsorForm(true);
  };

  const handleDeleteSponsor = async (id: number) => {
    if (confirm("Are you sure you want to delete this sponsor entry?")) {
      try {
        const res = await apiFetch(`${getApiUrl()}/api/events/marketing/sponsors/${id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.error?.message || "Failed to delete sponsor", "error");
          return;
        }
        setSponsors(sponsors.filter((s) => s.id !== id));
        showToast("Sponsor deleted", "success");
      } catch (err) {
        console.error("Failed to delete sponsor:", err);
        showToast("Failed to delete sponsor. Please try again.", "error");
      }
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

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (expenseSubmitting) return;

    const payload = {
      description: expenseForm.description,
      category: toBackendExpenseCategory(expenseForm.category),
      vendor: expenseForm.vendor,
      amount: parseFloat(expenseForm.amount) || 0,
      paymentDate: expenseForm.paymentDate || null,
      paymentMethod: expenseForm.paymentMethod || null,
      notes: expenseForm.notes || null,
      ...(editorFestId != null && { festId: editorFestId }),
      // Send freshly-picked files as { fileName, dataUrl } so the backend decodes
      // and stores them; already-stored files pass their existing url through.
      proofFiles: proofFiles.map(toFilePayload),
      billFiles: billFiles.map(toFilePayload),
    };

    setExpenseSubmitting(true);
    let success = false;
    try {
      if (editingExpense) {
        const res = await apiFetch(`${getApiUrl()}/api/events/marketing/expenses/${editingExpense.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.error?.message || "Failed to update expense", "error");
        } else {
          const ex: any = data.data;
          const updated: ExpenseEntry = {
            id: ex.id,
            description: ex.description,
            category: fromBackendExpenseCategory(ex.category),
            vendor: ex.vendor,
            amount: ex.amount || 0,
            paymentDate: ex.paymentDate ? ex.paymentDate.split("T")[0] : "",
            paymentMethod: ex.paymentMethod || "",
            notes: ex.notes || "",
            proofFiles: (ex.files || []).filter((f: any) => f.fileType === "PROOF").map((f: any) => ({
              name: f.fileName,
              size: f.fileSize || 0,
              type: f.mimeType || "",
              url: f.fileUrl || "",
            })),
            billFiles: (ex.files || []).filter((f: any) => f.fileType === "BILL").map((f: any) => ({
              name: f.fileName,
              size: f.fileSize || 0,
              type: f.mimeType || "",
              url: f.fileUrl || "",
            })),
            createdAt: ex.createdAt,
          };
          setExpenses(expenses.map((e) => (e.id === editingExpense.id ? updated : e)));
          success = true;
        }
      } else {
        const res = await apiFetch(`${getApiUrl()}/api/events/marketing/host/${hostId}/expenses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.error?.message || "Failed to create expense", "error");
        } else {
          const ex: any = data.data;
          const newExpense: ExpenseEntry = {
            id: ex.id,
            description: ex.description,
            category: fromBackendExpenseCategory(ex.category),
            vendor: ex.vendor,
            amount: ex.amount || 0,
            paymentDate: ex.paymentDate ? ex.paymentDate.split("T")[0] : "",
            paymentMethod: ex.paymentMethod || "",
            notes: ex.notes || "",
            proofFiles: (ex.files || []).filter((f: any) => f.fileType === "PROOF").map((f: any) => ({
              name: f.fileName,
              size: f.fileSize || 0,
              type: f.mimeType || "",
              url: f.fileUrl || "",
            })),
            billFiles: (ex.files || []).filter((f: any) => f.fileType === "BILL").map((f: any) => ({
              name: f.fileName,
              size: f.fileSize || 0,
              type: f.mimeType || "",
              url: f.fileUrl || "",
            })),
            createdAt: ex.createdAt,
          };
          setExpenses([newExpense, ...expenses]);
          success = true;
        }
      }
    } catch (err) {
      console.error("Failed to save expense:", err);
      showToast("Failed to save expense. Please try again.", "error");
    } finally {
      setExpenseSubmitting(false);
    }

    // Only close + reset on success; on failure keep the modal open with the
    // user's input so they can fix the error and retry.
    if (success) {
      setShowExpenseForm(false);
      resetExpenseForm();
    }
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

  const handleDeleteExpense = async (id: number) => {
    if (confirm("Are you sure you want to delete this expense entry?")) {
      try {
        const res = await apiFetch(`${getApiUrl()}/api/events/marketing/expenses/${id}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showToast(data.error?.message || "Failed to delete expense", "error");
          return;
        }
        setExpenses(expenses.filter((ex) => ex.id !== id));
        showToast("Expense deleted", "success");
      } catch (err) {
        console.error("Failed to delete expense:", err);
        showToast("Failed to delete expense. Please try again.", "error");
      }
    }
  };

  // Stats — prefer fest-wide totals (correct on multi-editor fests); fall back to
  // this host's own rows until the fest-wide fetch resolves.
  const totalSponsorshipAmount =
    festTotals?.sponsorship ?? sponsors.reduce((sum, s) => sum + s.sponsorshipAmount, 0);
  const totalReceivedAmount =
    festTotals?.received ?? sponsors.reduce((sum, s) => sum + s.receivedAmount, 0);
  const totalExpenses =
    festTotals?.expenses ?? expenses.reduce((sum, e) => sum + e.amount, 0);
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
                aria-label="Back to dashboard"
                className="p-1.5 hover:bg-[#C5BAC4]/30 rounded-lg transition-colors"
              >
                <svg aria-hidden="true" className="w-5 h-5 text-[#6B597F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <p className="text-3xl font-bold text-[#29104A]">{formatCurrency(totalSponsorshipAmount)}</p>
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
            <p className="text-3xl font-bold text-green-600">{formatCurrency(totalReceivedAmount)}</p>
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
            <p className="text-3xl font-bold text-red-500">{formatCurrency(totalExpenses)}</p>
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
              {netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance)}
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
              <svg aria-hidden="true" className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Company</th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Contact</th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Amount</th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Received</th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Status</th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Actions</th>
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
                        <p className="font-bold text-[#29104A]">{formatCurrency(sponsor.sponsorshipAmount)}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-green-600">{formatCurrency(sponsor.receivedAmount)}</p>
                        {sponsor.receivedAmount < sponsor.sponsorshipAmount && (
                          <p className="text-xs text-yellow-600">
                            Pending: {formatCurrency(sponsor.sponsorshipAmount - sponsor.receivedAmount)}
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
                            aria-label={`Edit sponsor ${sponsor.companyName}`}
                            className="p-2 hover:bg-[#C5BAC4]/30 rounded-lg transition-colors"
                          >
                            <svg aria-hidden="true" className="w-4 h-4 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteSponsor(sponsor.id)}
                            aria-label={`Delete sponsor ${sponsor.companyName}`}
                            className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                          >
                            <svg aria-hidden="true" className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Description</th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Category</th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Vendor</th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Amount</th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Date</th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Files</th>
                    <th scope="col" className="text-left px-6 py-4 text-sm font-semibold text-[#6B597F]">Actions</th>
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
                        <p className="font-bold text-red-500">{formatCurrency(expense.amount)}</p>
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
                            aria-label={`Edit expense ${expense.description}`}
                            className="p-2 hover:bg-[#C5BAC4]/30 rounded-lg transition-colors"
                          >
                            <svg aria-hidden="true" className="w-4 h-4 text-[#522C5D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(expense.id)}
                            aria-label={`Delete expense ${expense.description}`}
                            className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                          >
                            <svg aria-hidden="true" className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <div role="dialog" aria-modal="true" aria-labelledby="sponsor-modal-title" className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[#C5BAC4] flex items-center justify-between sticky top-0 bg-white">
              <h2 id="sponsor-modal-title" className="text-xl font-bold text-[#29104A]">
                {editingSponsor ? "Edit Sponsor" : "Add Sponsor"}
              </h2>
              <button
                onClick={() => { setShowSponsorForm(false); resetSponsorForm(); }}
                aria-label="Close dialog"
                className="p-2 hover:bg-[#C5BAC4]/30 rounded-lg transition-colors"
              >
                <svg aria-hidden="true" className="w-5 h-5 text-[#6B597F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSponsorSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="sponsor-company" className="block text-sm font-medium text-[#6B597F] mb-1.5">Company Name *</label>
                <input
                  id="sponsor-company"
                  type="text"
                  required
                  value={sponsorForm.companyName}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, companyName: e.target.value })}
                  className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="sponsor-contact" className="block text-sm font-medium text-[#6B597F] mb-1.5">Contact Person *</label>
                  <input
                    id="sponsor-contact"
                    type="text"
                    required
                    value={sponsorForm.contactPerson}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, contactPerson: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                  />
                </div>
                <div>
                  <label htmlFor="sponsor-phone" className="block text-sm font-medium text-[#6B597F] mb-1.5">Phone</label>
                  <input
                    id="sponsor-phone"
                    type="tel"
                    value={sponsorForm.phone}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, phone: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="sponsor-email" className="block text-sm font-medium text-[#6B597F] mb-1.5">Email</label>
                <input
                  id="sponsor-email"
                  type="email"
                  value={sponsorForm.email}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, email: e.target.value })}
                  className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="sponsor-amount" className="block text-sm font-medium text-[#6B597F] mb-1.5">Sponsorship Amount (₹) *</label>
                  <input
                    id="sponsor-amount"
                    type="number"
                    required
                    min="0"
                    value={sponsorForm.sponsorshipAmount}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, sponsorshipAmount: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                  />
                </div>
                <div>
                  <label htmlFor="sponsor-received" className="block text-sm font-medium text-[#6B597F] mb-1.5">Amount Received (₹)</label>
                  <input
                    id="sponsor-received"
                    type="number"
                    min="0"
                    value={sponsorForm.receivedAmount}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, receivedAmount: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="sponsor-status" className="block text-sm font-medium text-[#6B597F] mb-1.5">Status *</label>
                <select
                  id="sponsor-status"
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
                <label htmlFor="sponsor-notes" className="block text-sm font-medium text-[#6B597F] mb-1.5">Notes</label>
                <textarea
                  id="sponsor-notes"
                  value={sponsorForm.notes}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, notes: e.target.value })}
                  className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA] resize-none"
                  rows={2}
                />
              </div>

              {/* Agreement document upload */}
              <div>
                <label htmlFor="agreement-upload" className="block text-sm font-medium text-[#6B597F] mb-1.5">Agreement Document</label>
                <div className="border-2 border-dashed border-[#C5BAC4] rounded-lg p-4 text-center hover:border-[#522C5D] transition-colors bg-[#F9F7FA]">
                  <input
                    type="file"
                    id="agreement-upload"
                    aria-label="Upload agreement document (PDF or image)"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) setAgreementFile(await readFileAsDataUrl(file));
                      e.target.value = "";
                    }}
                    className="hidden"
                    accept="image/*,.pdf"
                  />
                  <label htmlFor="agreement-upload" className="cursor-pointer">
                    <svg className="w-8 h-8 mx-auto text-[#522C5D] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-[#6B597F]">Click to upload the signed agreement (PDF or image)</p>
                  </label>
                </div>
                {agreementFile && (
                  <div className="mt-2 flex items-center justify-between p-2 bg-[#522C5D]/5 rounded text-sm">
                    {agreementFile.url ? (
                      <button type="button" onClick={() => openMarketingFile(agreementFile.url, agreementFile.name)} className="text-[#522C5D] truncate underline text-left">{agreementFile.name}</button>
                    ) : (
                      <span className="text-[#522C5D] truncate">{agreementFile.name}</span>
                    )}
                    <button type="button" aria-label={`Remove agreement file ${agreementFile.name}`} onClick={() => setAgreementFile(null)} className="text-red-500 hover:text-red-700">×</button>
                  </div>
                )}
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
                  disabled={sponsorSubmitting}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sponsorSubmitting ? "Saving…" : `${editingSponsor ? "Update" : "Add"} Sponsor`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add/Edit Expense Modal */}
      {showExpenseForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="expense-modal-title" className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-[#C5BAC4] flex items-center justify-between sticky top-0 bg-white">
              <h2 id="expense-modal-title" className="text-xl font-bold text-[#29104A]">
                {editingExpense ? "Edit Expense" : "Add Expense"}
              </h2>
              <button
                onClick={() => { setShowExpenseForm(false); resetExpenseForm(); }}
                aria-label="Close dialog"
                className="p-2 hover:bg-[#C5BAC4]/30 rounded-lg transition-colors"
              >
                <svg aria-hidden="true" className="w-5 h-5 text-[#6B597F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleExpenseSubmit} className="p-6 space-y-4">
              <div>
                <label htmlFor="expense-description" className="block text-sm font-medium text-[#6B597F] mb-1.5">Description *</label>
                <input
                  id="expense-description"
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
                  <label htmlFor="expense-category" className="block text-sm font-medium text-[#6B597F] mb-1.5">Category *</label>
                  <select
                    id="expense-category"
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
                  <label htmlFor="expense-vendor" className="block text-sm font-medium text-[#6B597F] mb-1.5">Vendor *</label>
                  <input
                    id="expense-vendor"
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
                  <label htmlFor="expense-amount" className="block text-sm font-medium text-[#6B597F] mb-1.5">Amount (₹) *</label>
                  <input
                    id="expense-amount"
                    type="number"
                    required
                    min="0"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                  />
                </div>
                <div>
                  <label htmlFor="expense-date" className="block text-sm font-medium text-[#6B597F] mb-1.5">Payment Date *</label>
                  <input
                    id="expense-date"
                    type="date"
                    required
                    value={expenseForm.paymentDate}
                    onChange={(e) => setExpenseForm({ ...expenseForm, paymentDate: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#C5BAC4] rounded-lg focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D] outline-none bg-[#F9F7FA]"
                  />
                </div>
                <div>
                  <label htmlFor="expense-method" className="block text-sm font-medium text-[#6B597F] mb-1.5">Payment Method *</label>
                  <select
                    id="expense-method"
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
                <label htmlFor="proof-upload" className="block text-sm font-medium text-[#6B597F] mb-1.5">Proof of Payment</label>
                <div className="border-2 border-dashed border-[#C5BAC4] rounded-lg p-4 text-center hover:border-[#522C5D] transition-colors bg-[#F9F7FA]">
                  <input
                    type="file"
                    id="proof-upload"
                    aria-label="Upload payment proof (screenshots, receipts)"
                    multiple
                    onChange={(e) => handleFileUpload(e, setProofFiles, proofFiles)}
                    className="hidden"
                    accept="image/*,.pdf"
                  />
                  <label htmlFor="proof-upload" className="cursor-pointer">
                    <svg aria-hidden="true" className="w-8 h-8 mx-auto text-[#522C5D] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-[#6B597F]">Click to upload payment proof (screenshots, receipts)</p>
                  </label>
                </div>
                {proofFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {proofFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-green-50 rounded text-sm">
                        {file.url ? (
                          <button type="button" onClick={() => openMarketingFile(file.url, file.name)} className="text-green-700 truncate underline hover:text-green-900 text-left">{file.name}</button>
                        ) : (
                          <span className="text-green-700 truncate">{file.name}</span>
                        )}
                        <button type="button" aria-label={`Remove proof file ${file.name}`} onClick={() => removeFile(i, setProofFiles, proofFiles)} className="text-red-500 hover:text-red-700">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bill Upload */}
              <div>
                <label htmlFor="bill-upload" className="block text-sm font-medium text-[#6B597F] mb-1.5">Upload Bill/Invoice</label>
                <div className="border-2 border-dashed border-[#C5BAC4] rounded-lg p-4 text-center hover:border-[#522C5D] transition-colors bg-[#F9F7FA]">
                  <input
                    type="file"
                    id="bill-upload"
                    aria-label="Upload bill or invoice"
                    multiple
                    onChange={(e) => handleFileUpload(e, setBillFiles, billFiles)}
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx"
                  />
                  <label htmlFor="bill-upload" className="cursor-pointer">
                    <svg aria-hidden="true" className="w-8 h-8 mx-auto text-[#522C5D] mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-sm text-[#6B597F]">Click to upload bill/invoice</p>
                  </label>
                </div>
                {billFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {billFiles.map((file, i) => (
                      <div key={i} className="flex items-center justify-between p-2 bg-blue-50 rounded text-sm">
                        {file.url ? (
                          <button type="button" onClick={() => openMarketingFile(file.url, file.name)} className="text-blue-700 truncate underline hover:text-blue-900 text-left">{file.name}</button>
                        ) : (
                          <span className="text-blue-700 truncate">{file.name}</span>
                        )}
                        <button type="button" aria-label={`Remove bill file ${file.name}`} onClick={() => removeFile(i, setBillFiles, billFiles)} className="text-red-500 hover:text-red-700">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="expense-notes" className="block text-sm font-medium text-[#6B597F] mb-1.5">Notes</label>
                <textarea
                  id="expense-notes"
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
                  disabled={expenseSubmitting}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {expenseSubmitting ? "Saving…" : `${editingExpense ? "Update" : "Add"} Expense`}
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
