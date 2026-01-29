"use client";

import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

import RoleRequests from "@/components/admin/RoleRequests";
import FestEvents from "@/components/admin/FestEvents";
import Companies from "@/components/admin/Companies";
import Expenses from "@/components/admin/Expenses";

type AdminSection = "events" | "approvals" | "companies" | "expenses";

export default function AdminPage() {
  const [activeSection, setActiveSection] =
    useState<AdminSection>("approvals");

  return (
    <div className="min-h-screen bg-[#fdfdff] flex flex-col">
      <Header />
      
      <div className="flex-1 flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-[#C5BAC4] px-6 py-8">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#29104A] to-[#522C5D] flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#29104A]">Admin Panel</h2>
              <p className="text-xs text-[#6B597F]">Faculty Access</p>
            </div>
          </div>

          <nav className="space-y-2">
            <SidebarItem
              label="Role Approvals"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
              active={activeSection === "approvals"}
              onClick={() => setActiveSection("approvals")}
            />

            <SidebarItem
              label="Events"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              }
              active={activeSection === "events"}
              onClick={() => setActiveSection("events")}
            />

            <SidebarItem
              label="Sponsors"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              }
              active={activeSection === "companies"}
              onClick={() => setActiveSection("companies")}
            />

            <SidebarItem
              label="Expenses"
              icon={
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              }
              active={activeSection === "expenses"}
              onClick={() => setActiveSection("expenses")}
            />
          </nav>

          {/* Quick Stats */}
          <div className="mt-10 pt-6 border-t border-[#C5BAC4]">
            <p className="text-xs font-medium text-[#6B597F] mb-3">Quick Stats</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#6B597F]">Pending Approvals</span>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">3</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#6B597F]">Active Events</span>
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">5</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#6B597F]">Sponsors</span>
                <span className="px-2 py-0.5 bg-[#522C5D]/10 text-[#522C5D] rounded-full text-xs font-medium">8</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#6B597F]">Pending Expenses</span>
                <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">4</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Content Header */}
          <div className="px-8 py-6 border-b border-[#C5BAC4] bg-white">
            <h1 className="text-2xl font-bold text-[#29104A]">
              {activeSection === "events" && "Manage Events"}
              {activeSection === "approvals" && "Role Approval Requests"}
              {activeSection === "companies" && "Sponsor Agreements"}
              {activeSection === "expenses" && "Expense Tracking"}
            </h1>
            <p className="text-sm text-[#6B597F] mt-1">
              {activeSection === "events" && "View and manage all fest events"}
              {activeSection === "approvals" && "Review and approve editor role requests"}
              {activeSection === "companies" && "View sponsor documents and agreements"}
              {activeSection === "expenses" && "Track and review expenses submitted by event hosts"}
            </p>
          </div>

          {/* Content */}
          <main className="flex-1 px-8 py-8 overflow-auto">
            {activeSection === "events" && <FestEvents />}
            {activeSection === "approvals" && <RoleRequests />}
            {activeSection === "companies" && <Companies />}
            {activeSection === "expenses" && <Expenses />}
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}

/* Sidebar item component */
function SidebarItem({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all
        ${
          active
            ? "bg-gradient-to-r from-[#29104A] to-[#522C5D] text-white shadow-lg"
            : "text-[#6B597F] hover:bg-[#C5BAC4]/30 hover:text-[#29104A]"
        }`}
    >
      {icon}
      {label}
    </button>
  );
}
