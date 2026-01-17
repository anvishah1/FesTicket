"use client";

import { useState } from "react";

interface Company {
  id: number;
  name: string;
  agreementUrl: string;
  uploadedAt: string;
  verified: boolean;
  type: "image" | "pdf";
}

const companies: Company[] = [
  {
    id: 1,
    name: "Red Bull",
    agreementUrl: "/agreements/redbull.png",
    uploadedAt: "12 Jan 2025",
    verified: true,
    type: "image",
  },
  {
    id: 2,
    name: "Zomato",
    agreementUrl: "/agreements/zomato.pdf",
    uploadedAt: "18 Jan 2025",
    verified: false,
    type: "pdf",
  },
  {
    id: 3,
    name: "Spotify",
    agreementUrl: "/agreements/spotify.png",
    uploadedAt: "22 Jan 2025",
    verified: true,
    type: "image",
  },
];

export default function Companies() {
  const [selected, setSelected] = useState<Company | null>(null);
  const [search, setSearch] = useState("");
  const [zoom, setZoom] = useState(false);

  const filtered = companies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Company List */}
        <div className="space-y-4">
          <div className="relative">
            <input
              placeholder="Search companies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-2 pr-10 rounded-lg border border-[#C5BAC4] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#522C5D]/30"
            />

            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B597F] hover:text-[#29104A] text-sm"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>


          {filtered.length === 0 && (
            <p className="text-sm text-[#6B597F] text-center py-6">
              No companies found
            </p>
          )}

          {filtered.map((company) => (
            <button
              key={company.id}
              onClick={() => setSelected(company)}
              className={`w-full text-left rounded-xl border transition-all p-5
                ${
                  selected?.id === company.id
                    ? "border-[#522C5D] bg-[#522C5D]/5 shadow-sm"
                    : "border-[#C5BAC4] bg-white hover:border-[#522C5D]/50 hover:shadow-sm"
                }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-[#29104A]">
                  {company.name}
                </span>
              </div>

              <p className="text-xs text-[#6B597F]">
                Uploaded on {company.uploadedAt}
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
