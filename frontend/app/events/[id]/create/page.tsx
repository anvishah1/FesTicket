"use client";

import { useState } from "react";
import Sidebar from "@/components/event-create/Sidebar";
import EventBasics from "@/components/event-create/EventBasics";
import DescribeEvent from "@/components/event-create/DescribeEvent";
import EventLocation from "@/components/event-create/EventLocation";
import Tickets from "@/components/event-create/Tickets";
import RegistrationForm from "@/components/event-create/RegistrationForm";

type Step = "basics" | "describe" | "location" | "tickets" | "form";

export default function EventCreatePage() {
  const [step, setStep] = useState<Step>("basics");

  return (
    <div className="min-h-screen bg-[#fbf9f6]">
      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <span className="text-xl font-semibold">tiqr.events</span>
        <button className="rounded-full bg-emerald-700 px-4 py-2 text-white">
          Support
        </button>
      </header>

      {/* BODY */}
      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        <Sidebar current={step} onChange={setStep} />

        <div className="flex-1 rounded-xl bg-white p-6 shadow-sm">
          {step === "basics" && <EventBasics onNext={() => setStep("describe")} />}
          {step === "describe" && <DescribeEvent onNext={() => setStep("location")} />}
          {step === "location" && <EventLocation onNext={() => setStep("tickets")} />}
          {step === "tickets" && <Tickets onNext={() => setStep("form")} />}
          {step === "form" && <RegistrationForm />}
        </div>
      </div>
    </div>
  );
}
