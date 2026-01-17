"use client";

import { useState } from "react";

interface RoleRequest {
  id: number;
  studentName: string;
  eventName: string;
}

export default function RoleRequests() {
  const [requests, setRequests] = useState<RoleRequest[]>([
    {
      id: 1,
      studentName: "Abhiram Bojja",
      eventName: "Proshow Day 1",
    },
    {
      id: 2,
      studentName: "Rohan Menon",
      eventName: "Tech Expo",
    },
    {
      id: 3,
      studentName: "Ananya Pillai",
      eventName: "Workshop Series",
    },
  ]);

  const handleAction = (id: number) => {
    // Later: call backend API here
    setRequests((prev) => prev.filter((req) => req.id !== id));
  };

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      {requests.length === 0 ? (
        <div className="p-6 text-center text-sm text-gray-500">
          No pending approval requests
        </div>
      ) : (
        requests.map((req) => (
          <div
            key={req.id}
            className="flex items-center justify-between px-6 py-4 border-b last:border-b-0"
          >
            <div>
              <p className="font-medium text-[#29104A]">
                {req.studentName}
              </p>
              <p className="text-sm text-gray-500">
                Requested access for <b>{req.eventName}</b>
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => handleAction(req.id)}
                className="px-3 py-1.5 rounded-lg bg-green-100 text-green-700 text-sm font-medium hover:bg-green-200 transition"
              >
                Approve
              </button>
              <button
                onClick={() => handleAction(req.id)}
                className="px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200 transition"
              >
                Deny
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
