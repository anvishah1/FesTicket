"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getApiUrl } from "@/lib/auth";

const paymentMethods = [
  "Bank Transfer - NEFT/RTGS",
  "Cheque Payment",
  "UPI Transfer",
  "Cash",
  "Online Payment Gateway",
  "Other",
];

interface UploadedFile {
  name: string;
  size: number;
  type: string;
}

export default function SponsorRegistrationPage() {
  const router = useRouter();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  // Form state
  const [formData, setFormData] = useState({
    companyName: "",
    contactPerson: "",
    designation: "",
    email: "",
    phone: "",
    website: "",
    amount: "",
    movDetails: "",
    transactionId: "",
    notes: "",
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles: UploadedFile[] = Array.from(files).map(file => ({
        name: file.name,
        size: file.size,
        type: file.type,
      }));
      setUploadedFiles([...uploadedFiles, ...newFiles]);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const removeFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) {
      return (
        <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    }
    if (type === 'application/pdf') {
      return (
        <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${getApiUrl()}/api/sponsor-leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: formData.companyName,
          contactPerson: formData.contactPerson,
          email: formData.email,
          phone: formData.phone,
          message: formData.notes,
        }),
      });

      if (res.ok) {
        setSubmitted(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(
          data?.error?.message ||
            data?.message ||
            "Something went wrong. Please try again."
        );
      }
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <main className="min-h-screen bg-[var(--surface-tint)]">
        <Header />
        <div className="max-w-2xl mx-auto px-6 py-16">
          <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border-card)] p-8 text-center shadow-lg">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-3">Thank You for Your Sponsorship!</h1>
            <p className="text-[var(--text-muted)] mb-6">
              Your sponsorship details have been submitted successfully. Our team will review your information and contact you shortly to confirm the partnership.
            </p>
            <div className="bg-[var(--surface-tint)] rounded-xl p-4 mb-6 text-left">
              <p className="text-sm text-[var(--text-muted)] mb-2">Reference Details:</p>
              <p className="font-semibold text-[var(--text-primary)]">{formData.companyName}</p>
              <p className="text-sm text-[var(--text-muted)]">{formData.email}</p>
              {uploadedFiles.length > 0 && (
                <p className="text-xs text-[var(--text-muted)] mt-2">{uploadedFiles.length} file(s) uploaded</p>
              )}
            </div>
            <button
              onClick={() => router.push("/")}
              className="px-6 py-3 bg-gradient-to-r from-[#29104A] via-[#3D1B5C] to-[#1A4B6E] text-white rounded-lg font-semibold hover:opacity-90 transition-all"
            >
              Back to Home
            </button>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--surface-tint)] text-[var(--text-primary)]">
      <Header />
      
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Become a Sponsor</h1>
          <p className="text-[var(--text-muted)]">Partner with us and showcase your brand to thousands of attendees</p>
        </div>

        {/* Main Form */}
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border-card)] overflow-hidden shadow-lg">
          <div className="bg-gradient-to-r from-[#29104A] via-[#3D1B5C] to-[#1A4B6E] px-6 py-4">
            <h2 className="text-white font-semibold text-lg">Sponsorship Registration Form</h2>
            <p className="text-white/70 text-sm">Please fill in your company and payment details</p>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-8">
            {/* Company Details Section */}
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white flex items-center justify-center text-xs font-bold">1</span>
                Company Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label htmlFor="sponsor-company-name" className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">
                    Company Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="sponsor-company-name"
                    type="text"
                    required
                    aria-required="true"
                    value={formData.companyName}
                    onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                    className="w-full px-4 py-3 border border-[var(--border-card)] rounded-xl focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:border-[var(--border-plum)] outline-none transition-all bg-[var(--surface-tint)]"
                    placeholder="Enter your company name"
                  />
                </div>
                <div>
                  <label htmlFor="sponsor-contact-person" className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">
                    Contact Person <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="sponsor-contact-person"
                    type="text"
                    required
                    aria-required="true"
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    className="w-full px-4 py-3 border border-[var(--border-card)] rounded-xl focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:border-[var(--border-plum)] outline-none transition-all bg-[var(--surface-tint)]"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label htmlFor="sponsor-designation" className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">
                    Designation
                  </label>
                  <input
                    id="sponsor-designation"
                    type="text"
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="w-full px-4 py-3 border border-[var(--border-card)] rounded-xl focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:border-[var(--border-plum)] outline-none transition-all bg-[var(--surface-tint)]"
                    placeholder="e.g., Marketing Manager"
                  />
                </div>
                <div>
                  <label htmlFor="sponsor-email" className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="sponsor-email"
                    type="email"
                    required
                    aria-required="true"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-3 border border-[var(--border-card)] rounded-xl focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:border-[var(--border-plum)] outline-none transition-all bg-[var(--surface-tint)]"
                    placeholder="company@email.com"
                  />
                </div>
                <div>
                  <label htmlFor="sponsor-phone" className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="sponsor-phone"
                    type="tel"
                    required
                    aria-required="true"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-3 border border-[var(--border-card)] rounded-xl focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:border-[var(--border-plum)] outline-none transition-all bg-[var(--surface-tint)]"
                    placeholder="+91 98765 43210"
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="sponsor-website" className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">
                    Company Website
                  </label>
                  <input
                    id="sponsor-website"
                    type="url"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    className="w-full px-4 py-3 border border-[var(--border-card)] rounded-xl focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:border-[var(--border-plum)] outline-none transition-all bg-[var(--surface-tint)]"
                    placeholder="https://www.yourcompany.com"
                  />
                </div>
              </div>
            </div>

            {/* Sponsorship Details Section */}
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white flex items-center justify-center text-xs font-bold">2</span>
                Sponsorship Details
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label htmlFor="sponsor-notes" className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">
                    Additional Notes / Requirements
                  </label>
                  <textarea
                    id="sponsor-notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full px-4 py-3 border border-[var(--border-card)] rounded-xl focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:border-[var(--border-plum)] outline-none transition-all bg-[var(--surface-tint)] resize-none"
                    rows={3}
                    placeholder="Any specific requirements or branding preferences..."
                  />
                </div>
              </div>
            </div>

            {/* Payment Details Section */}
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white flex items-center justify-center text-xs font-bold">3</span>
                Payment Details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="sponsor-amount" className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">
                    Sponsorship Amount (₹) <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="sponsor-amount"
                    type="number"
                    required
                    aria-required="true"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-4 py-3 border border-[var(--border-card)] rounded-xl focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:border-[var(--border-plum)] outline-none transition-all bg-[var(--surface-tint)]"
                    placeholder="e.g., 500000"
                  />
                </div>
                <div>
                  <label htmlFor="sponsor-payment-mode" className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">
                    Mode of Payment <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="sponsor-payment-mode"
                    required
                    aria-required="true"
                    value={formData.movDetails}
                    onChange={(e) => setFormData({ ...formData, movDetails: e.target.value })}
                    className="w-full px-4 py-3 border border-[var(--border-card)] rounded-xl focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:border-[var(--border-plum)] outline-none transition-all bg-[var(--surface-tint)]"
                  >
                    <option value="">Select payment method</option>
                    {paymentMethods.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="sponsor-transaction-id" className="block text-sm font-medium text-[var(--text-muted)] mb-1.5">
                    Transaction ID / Reference Number
                  </label>
                  <input
                    id="sponsor-transaction-id"
                    type="text"
                    value={formData.transactionId}
                    onChange={(e) => setFormData({ ...formData, transactionId: e.target.value })}
                    className="w-full px-4 py-3 border border-[var(--border-card)] rounded-xl focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:border-[var(--border-plum)] outline-none transition-all bg-[var(--surface-tint)]"
                    placeholder="Enter transaction ID (if payment already made)"
                    aria-describedby="sponsor-transaction-hint"
                  />
                  <p id="sponsor-transaction-hint" className="text-xs text-[var(--text-muted)] mt-1.5">Leave blank if payment will be made later</p>
                </div>
              </div>
            </div>

            {/* Documents Upload Section */}
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white flex items-center justify-center text-xs font-bold">4</span>
                Upload Documents
              </h3>
              <div className="space-y-4">
                {/* Upload Area */}
                <div className="border-2 border-dashed border-[var(--border-card)] rounded-xl p-6 text-center hover:border-[var(--border-plum)] transition-colors bg-[var(--surface-tint)]">
                  <input
                    type="file"
                    id="file-upload"
                    multiple
                    onChange={handleFileUpload}
                    className="hidden"
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[color-mix(in_srgb,var(--fill-plum)_10%,transparent)] flex items-center justify-center">
                      <svg className="w-7 h-7 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="text-[var(--text-primary)] font-medium mb-1">Click to upload files</p>
                    <p className="text-sm text-[var(--text-muted)]">or drag and drop</p>
                    <p className="text-xs text-[#C5BAC4] mt-2">Images, PDFs, Documents (Max 10MB each)</p>
                  </label>
                </div>

                {/* Uploaded Files List */}
                {uploadedFiles.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-[var(--text-muted)]">Uploaded Files ({uploadedFiles.length})</p>
                    {uploadedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-[var(--surface-tint)] rounded-lg border border-[var(--border-card)]"
                      >
                        <div className="flex items-center gap-3">
                          {getFileIcon(file.type)}
                          <div>
                            <p className="text-sm font-medium text-[var(--text-primary)] truncate max-w-[200px]">{file.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">{formatFileSize(file.size)}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                        >
                          <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-[var(--text-muted)]">
                  Upload any relevant documents such as company logo, payment receipts, MOU drafts, or other supporting files.
                </p>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4 border-t border-[var(--border-card)]">
              {error && (
                <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                  {error}
                </div>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full px-6 py-4 bg-gradient-to-r from-[#29104A] via-[#3D1B5C] to-[#1A4B6E] text-white rounded-xl font-semibold hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Submitting...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Submit Sponsorship Details
                  </>
                )}
              </button>
              <p className="text-center text-xs text-[var(--text-muted)] mt-3">
                By submitting, you agree to our terms and conditions for sponsorship
              </p>
            </div>
          </form>
        </div>
      </div>

      <Footer />
    </main>
  );
}
