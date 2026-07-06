"use client";

import { useEffect, useState } from "react";
import { getApiUrl, apiFetch } from "@/lib/auth";
import { resolveMarketingFile } from "@/lib/files";

interface Company {
  id: number;
  name: string;
  contactPerson: string;
  email: string;
  amount: number;
  agreementUrl: string;
  uploadedAt: string;
  type: "image" | "pdf";
  status: "confirmed" | "pending" | "negotiating";
}

interface CompaniesProps {
  festId: number;
}

export default function Companies({ festId }: CompaniesProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selected, setSelected] = useState<Company | null>(null);
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(false);
  const [sortBy, setSortBy] = useState<"name-asc" | "name-desc" | "recent">("recent");
  // The agreement file is streamed through the authenticated marketing-files
  // route and shown via an object URL (see @/lib/files). Fetched on select.
  const [agreementSrc, setAgreementSrc] = useState("");

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;
    setAgreementSrc("");
    if (selected?.agreementUrl) {
      resolveMarketingFile(selected.agreementUrl).then((src) => {
        if (cancelled) {
          if (src.startsWith("blob:")) URL.revokeObjectURL(src);
          return;
        }
        objectUrl = src.startsWith("blob:") ? src : "";
        setAgreementSrc(src);
      });
    }
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [selected]);

  useEffect(() => {
    const fetchSponsors = async () => {
      try {
        const res = await apiFetch(
          `${getApiUrl()}/api/events/marketing/fest/${festId}/sponsors`
        );
        const json = await res.json();
        if (!res.ok || !json.success) return;

        const mapped: Company[] = json.data.map((s: any) => ({
          id: s.id,
          name: s.companyName,
          contactPerson: s.contactPerson,
          email: s.email || "",
          amount: s.sponsorshipAmount || 0,
          agreementUrl: s.agreementUrl || "",
          uploadedAt: s.createdAt,
          type: (s.agreementType === "PDF" ? "pdf" : "image") as
            | "image"
            | "pdf",
          status: s.status === "CONFIRMED"
            ? "confirmed"
            : s.status === "PENDING"
            ? "pending"
            : "negotiating",
        }));

        setCompanies(mapped);
      } catch (err) {
        console.error("Failed to load fest sponsors:", err);
      }
    };

    fetchSponsors();
  }, [festId]);

  const searchTerm = search.toLowerCase();
  const filteredCompanies = companies
    .filter((company) => company.name.toLowerCase().includes(searchTerm))
    .sort((a, b) => {
      if (sortBy === "name-asc") return a.name.localeCompare(b.name);
      if (sortBy === "name-desc") return b.name.localeCompare(a.name);
      return new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime();
    });

  const totalSponsorship = companies.reduce((sum, c) => sum + c.amount, 0);

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-[#C5BAC4] p-4 shadow-sm">
          <p className="text-sm text-[#6B597F]">Total Sponsors</p>
          <p className="text-2xl font-bold text-[#29104A]">{companies.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#C5BAC4] p-4 shadow-sm">
          <p className="text-sm text-[#6B597F]">Total Sponsorship</p>
          <p className="text-2xl font-bold text-[#29104A]">₹{totalSponsorship.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#C5BAC4] p-4 shadow-sm">
          <p className="text-sm text-[#6B597F]">Confirmed</p>
          <p className="text-2xl font-bold text-green-600">
            {companies.filter(c => c.status === "confirmed").length}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Company List */}
        <div className="space-y-4">
          {/* Search + Sort */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <svg aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B597F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                aria-label="Search sponsors"
                placeholder="Search sponsors..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-[#C5BAC4] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#522C5D]/20 focus:border-[#522C5D]"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B597F] hover:text-[#29104A]"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              aria-label="Sort sponsors"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="px-3 py-2.5 rounded-xl border border-[#C5BAC4] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#522C5D]/20"
            >
              <option value="recent">Recent</option>
              <option value="name-asc">A → Z</option>
              <option value="name-desc">Z → A</option>
            </select>
          </div>

          {/* Company Cards */}
          {filteredCompanies.length === 0 && (
            <div className="bg-white rounded-xl border border-[#C5BAC4] p-8 text-center">
              <p className="text-sm text-[#6B597F]">No sponsors found</p>
            </div>
          )}

          {filteredCompanies.map((company) => (
            <button
              key={company.id}
              onClick={() => setSelected(company)}
              className={`w-full text-left rounded-xl border p-5 transition-all
                ${
                  selected?.id === company.id
                    ? "border-[#522C5D] bg-[#522C5D]/5 shadow-md"
                    : "border-[#C5BAC4] bg-white hover:border-[#522C5D]/50 hover:shadow-sm"
                }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-[#29104A]">{company.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  company.status === "confirmed" 
                    ? "bg-green-100 text-green-700" 
                    : "bg-yellow-100 text-yellow-700"
                }`}>
                  {company.status}
                </span>
              </div>
              <p className="text-sm text-[#6B597F]">{company.contactPerson}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-[#C5BAC4]">
                  {new Date(company.uploadedAt).toLocaleDateString("en-GB")}
                </span>
                <span className="text-sm font-medium text-[#522C5D]">
                  ₹{company.amount.toLocaleString()}
                </span>
              </div>
            </button>
          ))}
        </div>

        {/* RIGHT: Agreement Preview */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#C5BAC4] p-6 min-h-[400px] shadow-sm flex flex-col">
          {selected ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-[#29104A] text-lg">{selected.name}</h3>
                  <p className="text-sm text-[#6B597F]">{selected.email}</p>
                </div>
                {selected.agreementUrl && (
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
                      selected.type === "pdf"
                        ? "bg-red-100 text-red-700"
                        : "bg-blue-100 text-blue-700"
                    }`}>
                      {selected.type.toUpperCase()}
                    </span>
                    <button
                      onClick={() => setZoom(true)}
                      className="px-3 py-1.5 bg-[#522C5D]/10 text-[#522C5D] rounded-lg text-sm font-medium hover:bg-[#522C5D]/20 transition"
                    >
                      Full Screen
                    </button>
                  </div>
                )}
              </div>

              <div className="flex-1 rounded-xl border border-[#C5BAC4] overflow-hidden bg-[#F9F7FA] flex items-center justify-center">
                {!selected.agreementUrl ? (
                  <div className="text-center px-6 py-10">
                    <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-[#C5BAC4]/30 flex items-center justify-center">
                      <svg className="w-7 h-7 text-[#6B597F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-[#6B597F] font-medium">No agreement uploaded</p>
                    <p className="text-sm text-[#6B597F] mt-1">
                      This sponsor doesn&apos;t have an agreement document on file yet.
                    </p>
                  </div>
                ) : !agreementSrc ? (
                  <div className="text-sm text-[#6B597F] px-6 py-10">Loading agreement…</div>
                ) : selected.type === "image" ? (
                  <img
                    src={agreementSrc}
                    alt="Agreement"
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <iframe
                    src={agreementSrc}
                    className="w-full h-full min-h-[300px]"
                    title="Agreement PDF"
                  />
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-[#C5BAC4] flex items-center justify-between">
                <div>
                  <p className="text-sm text-[#6B597F]">Sponsorship Amount</p>
                  <p className="text-xl font-bold text-[#29104A]">₹{selected.amount.toLocaleString()}</p>
                </div>
                {selected.agreementUrl && agreementSrc && (
                  <a
                    href={agreementSrc}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    className="px-4 py-2 bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white rounded-lg font-medium hover:opacity-90 transition"
                  >
                    Download Agreement
                  </a>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#C5BAC4]/30 flex items-center justify-center">
                  <svg className="w-8 h-8 text-[#6B597F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-[#6B597F]">Select a sponsor to view their agreement</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ZOOM MODAL */}
      {zoom && selected && selected.agreementUrl && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="agreement-zoom-title" className="bg-white rounded-2xl w-full max-w-5xl h-[90vh] p-6 relative">
            <div className="flex items-center justify-between mb-4">
              <h3 id="agreement-zoom-title" className="font-bold text-[#29104A] text-lg">{selected.name} - Agreement</h3>
              <button
                onClick={() => setZoom(false)}
                aria-label="Close agreement preview"
                className="p-2 hover:bg-[#C5BAC4]/30 rounded-lg transition"
              >
                <svg aria-hidden="true" className="w-5 h-5 text-[#6B597F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="h-[calc(100%-60px)] rounded-xl border border-[#C5BAC4] overflow-hidden bg-[#F9F7FA]">
              {selected.type === "image" ? (
                <img
                  src={agreementSrc}
                  alt="Agreement"
                  className="w-full h-full object-contain"
                />
              ) : (
                <iframe
                  src={agreementSrc}
                  className="w-full h-full"
                  title="Agreement PDF"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
