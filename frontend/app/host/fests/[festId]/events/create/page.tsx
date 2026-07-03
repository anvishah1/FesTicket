"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getApiUrl, getAccessToken } from "@/lib/auth";
import Sidebar from "@/components/event-create/Sidebar";
import EventBasics, { EventBasicsData } from "@/components/event-create/EventBasics";
import DescribeEvent, { DescribeEventData } from "@/components/event-create/DescribeEvent";
import EventLocation, { EventLocationData } from "@/components/event-create/EventLocation";
import Tickets, { TicketsData } from "@/components/event-create/Tickets";
import RegistrationForm, { RegistrationFormData } from "@/components/event-create/RegistrationForm";

type Step = "basics" | "describe" | "location" | "tickets" | "form";

interface Fest {
  id: number;
  name: string;
  college: string;
}

export default function EventCreatePage() {
  const params = useParams();
  const router = useRouter();
  const festId = params.festId as string;
  
  const [step, setStep] = useState<Step>("basics");
  const [fest, setFest] = useState<Fest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Store all form data
  const [eventData, setEventData] = useState<{
    basics?: EventBasicsData;
    describe?: DescribeEventData;
    location?: EventLocationData;
    tickets?: TicketsData;
    form?: RegistrationFormData;
  }>({});

  useEffect(() => {
    const fetchFest = async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/fests/${festId}`);
        const data = await response.json();
        if (data.success) {
          setFest(data.data);
        } else {
          setError("Fest not found");
        }
      } catch (err) {
        setError("Failed to load fest details");
      } finally {
        setLoading(false);
      }
    };

    if (festId) {
      fetchFest();
    }
  }, [festId]);

  const handleBasicsSubmit = (data: EventBasicsData) => {
    setEventData({ ...eventData, basics: data });
    setStep("describe");
  };

  const handleDescribeSubmit = (data: DescribeEventData) => {
    setEventData({ ...eventData, describe: data });
    setStep("location");
  };

  const handleLocationSubmit = (data: EventLocationData) => {
    setEventData({ ...eventData, location: data });
    setStep("tickets");
  };

  const handleTicketsSubmit = (data: TicketsData) => {
    setEventData({ ...eventData, tickets: data });
    setStep("form");
  };

  const handleFinalSubmit = async (data: RegistrationFormData) => {
    setIsSubmitting(true);
    
    const fullEventData = {
      ...eventData,
      form: data,
    };

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = getAccessToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch(`${getApiUrl()}/api/events`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          festId: parseInt(festId),
          name: fullEventData.basics?.name,
          shortDescription: fullEventData.basics?.shortDescription,
          description: fullEventData.describe?.description,
          category: fullEventData.describe?.category,
          audience: fullEventData.describe?.audience,
          image: fullEventData.basics?.image,
          startDate: fullEventData.basics?.startDate || null,
          endDate: fullEventData.basics?.endDate || null,
          visibility: fullEventData.basics?.visibility,
          eventType: fullEventData.basics?.eventType,
          venue: fullEventData.location?.venue,
          address: fullEventData.location?.address,
          meetingLink: fullEventData.location?.meetingLink,
          ticketTypes: fullEventData.tickets?.tickets.map((t) => ({
            name: t.name,
            price: t.price,
            quantity: t.quantity,
          })),
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert("Event created successfully!");
        router.push("/host/dashboard");
      } else {
        alert(result.error?.message || "Failed to create event");
      }
    } catch (err) {
      alert("Failed to connect to server. Make sure backend is running.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fbf9f6] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#522C5D] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error || !fest) {
    return (
      <div className="min-h-screen bg-[#fbf9f6] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-[#29104A] mb-2">Fest Not Found</h2>
          <p className="text-[#6B597F] mb-4">{error || "The fest you're looking for doesn't exist."}</p>
          <button
            onClick={() => router.push("/host/dashboard")}
            className="px-6 py-2 bg-[#522C5D] text-white rounded-lg hover:bg-[#29104A] transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fbf9f6]">
      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/host/dashboard")}
            className="p-2 hover:bg-[#C5BAC4]/20 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-[#6B597F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <span className="text-xl font-semibold text-[#29104A]">tiqr.events</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm text-[#6B597F]">Creating event for</span>
              <span className="text-sm font-medium text-[#522C5D] bg-[#522C5D]/10 px-2 py-0.5 rounded">
                {fest.name}
              </span>
            </div>
          </div>
        </div>
        <button className="rounded-full bg-[#522C5D] px-4 py-2 text-white hover:bg-[#29104A] transition-colors">
          Support
        </button>
      </header>

      {/* BODY */}
      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        <Sidebar current={step} onChange={setStep} />

        <div className="flex-1">
          {step === "basics" && (
            <EventBasics 
              onNext={handleBasicsSubmit} 
              initialData={eventData.basics}
            />
          )}
          {step === "describe" && (
            <DescribeEvent 
              onNext={handleDescribeSubmit}
              initialData={eventData.describe}
            />
          )}
          {step === "location" && (
            <EventLocation 
              onNext={handleLocationSubmit}
              initialData={eventData.location}
            />
          )}
          {step === "tickets" && (
            <Tickets 
              onNext={handleTicketsSubmit}
              initialData={eventData.tickets}
            />
          )}
          {step === "form" && (
            <RegistrationForm 
              onSubmit={handleFinalSubmit}
              isSubmitting={isSubmitting}
              initialData={eventData.form}
            />
          )}
        </div>
      </div>
    </div>
  );
}
