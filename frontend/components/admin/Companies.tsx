"use client";

import { useState } from "react";

interface Company {
  id: number;
  name: string;
  agreementImage: string;
}

const companies: Company[] = [
  {
    id: 1,
    name: "Red Bull",
    agreementImage: "/agreements/redbull.png",
  },
  {
    id: 2,
    name: "Zomato",
    agreementImage: "/agreements/zomato.png",
  },
  {
    id: 3,
    name: "Spotify",
    agreementImage: "/agreements/spotify.png",
  },
];

export default function Companies() {
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Company List */}
      <div className="space-y-4">
        {companies.map((company) => (
          <button
            key={company.id}
            onClick={() => setSelectedCompany(company)}
            className={`w-full text-left rounded-xl border transition-all p-5
              ${
                selectedCompany?.id === company.id
                  ? "border-[#522C5D] bg-[#522C5D]/5 shadow-sm"
                  : "border-[#C5BAC4] bg-white hover:shadow-sm hover:border-[#522C5D]/50"
              }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-[#29104A]">
                {company.name}
              </span>
              <span className="text-xs text-[#6B597F]">
                View agreement →
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Agreement Preview */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-[#C5BAC4] p-6 flex items-center justify-center min-h-[360px] shadow-sm">
        {selectedCompany ? (
          <div className="w-full h-full flex flex-col">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-[#29104A]">
                {selectedCompany.name} Agreement
              </h3>
              <span className="text-xs text-[#6B597F]">
                Uploaded document
              </span>
            </div>

            <div className="flex-1 rounded-xl border overflow-hidden bg-[#fdfdff]">
              <img
                src={selectedCompany.agreementImage}
                alt="Agreement document"
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        ) : (
          <div className="text-center text-[#6B597F]">
            <p className="text-sm">Select a company to view agreement</p>
          </div>
        )}
      </div>
    </div>
  );
}
