"use client";

import { useState } from "react";

import RoleRequests from "@/components/admin/RoleRequests";
import FestEvents from "@/components/admin/FestEvents";
import Companies from "@/components/admin/Companies";

type AdminSection = "events" | "approvals" | "companies";

export default function AdminPage() {
  const [activeSection, setActiveSection] =
    useState<AdminSection>("events");

  return (
    <div className="min-h-screen bg-[#f8f6fc] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r px-6 py-8">
        <h2 className="text-xl font-semibold text-purple-700 mb-8">
          Fest Admin
        </h2>

        <nav className="space-y-2">
          <SidebarItem
            label="Events"
            active={activeSection === "events"}
            onClick={() => setActiveSection("events")}
          />

          <SidebarItem
            label="Approvals"
            active={activeSection === "approvals"}
            onClick={() => setActiveSection("approvals")}
          />

          <SidebarItem
            label="Companies"
            active={activeSection === "companies"}
            onClick={() => setActiveSection("companies")}
          />
        </nav>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-8 py-4 bg-white border-b">
          <h1 className="text-2xl font-semibold text-purple-700">
            {activeSection === "events" && "Manage Events"}
            {activeSection === "approvals" && "Role Approvals"}
            {activeSection === "companies" && "Company Agreements"}
          </h1>
          <span className="text-sm text-gray-500">Admin Access</span>
        </header>

        {/* Content */}
        <main className="px-8 py-8">
          {activeSection === "events" && <FestEvents />}
          {activeSection === "approvals" && <RoleRequests />}
          {activeSection === "companies" && <Companies />}
        </main>
      </div>
    </div>
  );
}

/* Sidebar item component */
function SidebarItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition
        ${
          active
            ? "bg-purple-100 text-purple-700"
            : "text-gray-600 hover:bg-gray-100"
        }`}
    >
      {label}
    </button>
  );
}
