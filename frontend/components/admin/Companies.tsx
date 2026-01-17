"use client";

import { useState } from "react";

interface Company {
  id: number;
  name: string;
  agreementUrl: string;
  uploadedAt: string;
  type: "image" | "pdf";
}

const companies: Company[] = [
  {
    id: 1,
    name: "Red Bull",
    agreementUrl: "/agreements/redbull.png",
    uploadedAt: "2025-01-12",
    type: "image",
  },
  {
    id: 2,
    name: "Zomato",
    agreementUrl: "/agreements/zomato.pdf",
    uploadedAt: "2025-01-18",
    type: "pdf",
  },
  {
    id: 3,
    name: "Spotify",
    agreementUrl: "/agreements/spotify.png",
    uploadedAt: "2025-01-22",
    type: "image",
  },
];

export default function Companies() {
  const [selected, setSelected] = useState<Company | null>(null);
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(false);
  const [sortBy, setSortBy] = useState<
    "name-asc" | "name-desc" | "recent"
  >("name-asc");

  const filteredCompanies = companies
    .filter((company) =>
      company.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "name-asc") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "name-desc") {
        return b.name.localeCompare(a.name);
      }
      return (
        new Date(b.uploadedAt).getTime() -
        new Date(a.uploadedAt).getTime()
      );
    });

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Company List */}
        <div className="space-y-4">
          {/* Search + Sort */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                placeholder="Search companies..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2 pr-10 rounded-lg border border-[#C5BAC4] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#522C5D]/30"
              />

              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B597F] hover:text-[#29104A]"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as any)
              }
              className="px-3 py-2 rounded-lg border border-[#C5BAC4] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#522C5D]/30"
            >
              <option value="name-asc">A → Z</option>
              <option value="name-desc">Z → A</option>
              <option value="recent">Recently added</option>
            </select>
          </div>

          {/* Company Cards */}
          {filteredCompanies.length === 0 && (
            <p className="text-sm text-[#6B597F] text-center py-8">
              No companies found
            </p>
          )}

          {filteredCompanies.map((company) => (
            <button
              key={company.id}
              onClick={() => setSelected(company)}
              className={`w-full text-left rounded-xl border p-5 transition-all
                ${
                  selected?.id === company.id
                    ? "border-[#522C5D] bg-[#522C5D]/5 shadow-sm"
                    : "border-[#C5BAC4] bg-white hover:border-[#522C5D]/50 hover:shadow-sm"
                }`}
            >
              <div className="mb-1 font-medium text-[#29104A]">
                {company.name}
              </div>
              <p className="text-xs text-[#6B597F]">
                Uploaded on{" "}
                {new Date(company.uploadedAt).toLocaleDateString("en-GB")}
              </p>
            </button>
          ))}
        </div>

        {/* RIGHT: Agreement Preview */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#C5BAC4] p-6 min-h-[380px] shadow-sm flex items-center justify-center">
          {selected ? (
            <div className="w-full h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-[#29104A]">
                    {selected.name} Agreement
                  </h3>
                  <p className="text-xs text-[#6B597F]">
                    {selected.type === "pdf"
                      ? "PDF document"
                      : "Image document"}
                  </p>
                </div>

                <button
                  onClick={() => setZoom(true)}
                  className="text-sm text-[#522C5D] hover:underline"
                >
                  Zoom
                </button>
              </div>

              <div className="flex-1 rounded-xl border overflow-hidden bg-[#fdfdff] flex items-center justify-center">
                {selected.type === "image" ? (
                  <img
                    src={selected.agreementUrl}
                    alt="Agreement"
                    className="max-h-full object-contain"
                  />
                ) : (
                  <iframe
                    src={selected.agreementUrl}
                    className="w-full h-full"
                  />
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[#6B597F]">
              Select a company to view agreement
            </p>
          )}
        </div>
      </div>

      {/* ZOOM MODAL */}
      {zoom && selected && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="bg-white rounded-xl w-[90%] h-[90%] p-4 relative">
            <button
              onClick={() => setZoom(false)}
              className="absolute top-3 right-3 text-sm text-[#522C5D]"
            >
              ✕ Close
            </button>

            {selected.type === "image" ? (
              <img
                src={selected.agreementUrl}
                alt="Agreement"
                className="w-full h-full object-contain"
              />
            ) : (
              <iframe
                src={selected.agreementUrl}
                className="w-full h-full"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
