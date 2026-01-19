"use client";

import { useState } from "react";

interface RoleRequest {
  id: number;
  studentName: string;
  email: string;
  organization: string;
  requestedRole: string;
  requestDate: string;
}

export default function RoleRequests() {
  const [requests, setRequests] = useState<RoleRequest[]>([
    {
      id: 1,
      studentName: "Abhiram Bojja",
      email: "abhiram@nitc.ac.in",
      organization: "Tathva Organizing Committee",
      requestedRole: "Editor",
      requestDate: "Jan 18, 2025",
    },
    {
      id: 2,
      studentName: "Rohan Menon",
      email: "rohan.m@nitc.ac.in",
      organization: "Tech Club",
      requestedRole: "Editor",
      requestDate: "Jan 17, 2025",
    },
    {
      id: 3,
      studentName: "Ananya Pillai",
      email: "ananya.p@nitc.ac.in",
      organization: "Cultural Committee",
      requestedRole: "Editor",
      requestDate: "Jan 16, 2025",
    },
  ]);

  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const handleApprove = async (id: number) => {
    setActionLoading(id);
    // TODO: Call backend API
    await new Promise((r) => setTimeout(r, 500));
    setRequests((prev) => prev.filter((req) => req.id !== id));
    setActionLoading(null);
  };

  const handleDeny = async (id: number) => {
    setActionLoading(id);
    // TODO: Call backend API
    await new Promise((r) => setTimeout(r, 500));
    setRequests((prev) => prev.filter((req) => req.id !== id));
    setActionLoading(null);
  };

  return (
    <div className="space-y-4">
      {requests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#C5BAC4] p-12 text-center shadow-sm">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-lg font-medium text-[#29104A]">All caught up!</p>
          <p className="text-sm text-[#6B597F] mt-1">No pending approval requests</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#C5BAC4] overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-[#C5BAC4] bg-[#C5BAC4]/10">
            <p className="font-semibold text-[#29104A]">{requests.length} Pending Request{requests.length > 1 ? 's' : ''}</p>
          </div>
          
          <div className="divide-y divide-[#C5BAC4]">
            {requests.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between px-6 py-5 hover:bg-[#C5BAC4]/5 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#29104A] to-[#522C5D] flex items-center justify-center text-white font-bold">
                    {req.studentName.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-[#29104A]">
                      {req.studentName}
                    </p>
                    <p className="text-sm text-[#6B597F]">
                      {req.email}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-2 py-0.5 bg-[#522C5D]/10 text-[#522C5D] rounded text-xs font-medium">
                        {req.requestedRole}
                      </span>
                      <span className="text-xs text-[#C5BAC4]">•</span>
                      <span className="text-xs text-[#6B597F]">{req.organization}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-xs text-[#6B597F]">{req.requestDate}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(req.id)}
                      disabled={actionLoading === req.id}
                      className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition disabled:opacity-50 flex items-center gap-2"
                    >
                      {actionLoading === req.id ? (
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      Approve
                    </button>
                    <button
                      onClick={() => handleDeny(req.id)}
                      disabled={actionLoading === req.id}
                      className="px-4 py-2 rounded-lg bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200 transition disabled:opacity-50"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
