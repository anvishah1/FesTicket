"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { getApiUrl, getAccessToken, getStoredUser } from "@/lib/auth";
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
  // undefined = not yet checked, false = denied (redirecting), true = allowed
  const [authorized, setAuthorized] = useState<boolean | undefined>(undefined);

  // Store all form data
  const [eventData, setEventData] = useState<{
    basics?: EventBasicsData;
    describe?: DescribeEventData;
    location?: EventLocationData;
    tickets?: TicketsData;
    form?: RegistrationFormData;
  }>({});

  // AUTH GUARD: block the whole wizard for non-hosts up front, instead of
  // letting them fill every step and only failing at submit.
  useEffect(() => {
    const token = getAccessToken();
    const user = getStoredUser();
    const allowed = ["EDITOR", "HOST", "ADMIN"];
    if (!token || !user || !allowed.includes(user.role)) {
      setAuthorized(false);
      router.replace("/signin");
      return;
    }
    setAuthorized(true);
  }, [router]);

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
      } catch {
        setError("Failed to load fest details");
      } finally {
        setLoading(false);
      }
    };

    if (festId) {
      fetchFest();
    }
  }, [festId]);

  // --- Continuous persistence (H11): every step reports edits here so
  // navigating away via the Sidebar (without "Save & Continue") keeps them. ---
  const handleBasicsChange = (data: EventBasicsData) =>
    setEventData((prev) => ({ ...prev, basics: data }));
  const handleDescribeChange = (data: DescribeEventData) =>
    setEventData((prev) => ({ ...prev, describe: data }));
  const handleLocationChange = (data: EventLocationData) =>
    setEventData((prev) => ({ ...prev, location: data }));
  const handleTicketsChange = (data: TicketsData) =>
    setEventData((prev) => ({ ...prev, tickets: data }));
  const handleFormChange = (data: RegistrationFormData) =>
    setEventData((prev) => ({ ...prev, form: data }));

  const handleBasicsSubmit = (data: EventBasicsData) => {
    setEventData((prev) => ({ ...prev, basics: data }));
    setStep("describe");
  };

  const handleDescribeSubmit = (data: DescribeEventData) => {
    setEventData((prev) => ({ ...prev, describe: data }));
    setStep("location");
  };

  const handleLocationSubmit = (data: EventLocationData) => {
    setEventData((prev) => ({ ...prev, location: data }));
    setStep("tickets");
  };

  const handleTicketsSubmit = (data: TicketsData) => {
    setEventData((prev) => ({ ...prev, tickets: data }));
    setStep("form");
  };

  // --- Derived completion state, used to gate Sidebar jumps (H12) ---
  const basicsComplete = !!eventData.basics?.name?.trim();

  const ticketsComplete = (() => {
    const list = (eventData.tickets?.tickets || []).filter((t) => t.name.trim());
    return (
      list.length > 0 &&
      list.every(
        (t) =>
          Number.isFinite(t.price) &&
          t.price >= 0 &&
          Number.isFinite(t.quantity) &&
          t.quantity > 0
      )
    );
  })();

  const locationComplete = (() => {
    const loc = eventData.location;
    if (!loc) return false;
    return loc.locationType === "ONLINE"
      ? !!loc.meetingLink.trim()
      : !!loc.venue.trim();
  })();

  // Can't jump to "form" (which publishes) until tickets + location are valid;
  // everything past basics unlocks once basics has a name.
  const isStepEnabled = (target: Step): boolean => {
    if (target === "basics") return true;
    if (!basicsComplete) return false;
    if (target === "form") return ticketsComplete && locationComplete;
    return true;
  };

  const handleFinalSubmit = async (data: RegistrationFormData) => {
    // --- Guard against publishing an event with no venue / no tickets (H12) ---
    if (!basicsComplete) {
      alert("Please add an event name in Event Basics before publishing.");
      setStep("basics");
      return;
    }

    const validTickets = (eventData.tickets?.tickets || []).filter((t) =>
      t.name.trim()
    );
    if (validTickets.length === 0) {
      alert("Add at least one ticket type (with a name) before publishing.");
      setStep("tickets");
      return;
    }
    for (const t of validTickets) {
      if (!Number.isFinite(t.price) || t.price < 0) {
        alert(`Ticket "${t.name}" has an invalid price. Price cannot be negative.`);
        setStep("tickets");
        return;
      }
      if (!Number.isFinite(t.quantity) || t.quantity <= 0) {
        alert(`Ticket "${t.name}" needs a quantity of at least 1.`);
        setStep("tickets");
        return;
      }
    }

    const loc = eventData.location;
    if (!loc) {
      alert("Please complete the Event Location step before publishing.");
      setStep("location");
      return;
    }
    const isOnline = loc.locationType === "ONLINE";
    if (isOnline && !loc.meetingLink.trim()) {
      alert("Please add a meeting link for your online event.");
      setStep("location");
      return;
    }
    if (!isOnline && !loc.venue.trim()) {
      alert("Please add a venue for your offline event.");
      setStep("location");
      return;
    }

    setIsSubmitting(true);

    const fullEventData = {
      ...eventData,
      form: data,
    };

    // Location type is authoritative for online/offline (H). Send both the
    // canonical fields (isOnline/onlineLink/venue) and the legacy aliases the
    // backend also accepts, mutually exclusive so nothing conflicts.
    const isPaid = fullEventData.tickets?.isPaid ?? true;

    // Map the wizard's custom questions to the persisted shape
    // ({ label, type, required, order, options? }). Blank-label questions are
    // already dropped by RegistrationForm on submit; filter again defensively.
    const questions = (fullEventData.form?.questions || [])
      .filter((q) => q.label?.trim())
      .map((q, index) => ({
        label: q.label.trim(),
        type: q.type || "text",
        required: !!q.required,
        order: index,
      }));

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
          // startDate/endDate are datetime-local strings ("YYYY-MM-DDTHH:MM");
          // carry the time-of-day through to Event.startTime/endTime (String? cols).
          startTime: fullEventData.basics?.startDate?.split("T")[1] || null,
          endTime: fullEventData.basics?.endDate?.split("T")[1] || null,
          visibility: fullEventData.basics?.visibility,
          // Location type — not EventBasics.eventType — decides online/offline.
          isOnline,
          eventType: isOnline ? "ONLINE" : "OFFLINE",
          venue: isOnline ? null : loc.venue || null,
          address: isOnline ? null : loc.address || null,
          venueAddress: isOnline ? null : loc.address || null,
          onlineLink: isOnline ? loc.meetingLink || null : null,
          meetingLink: isOnline ? loc.meetingLink || null : null,
          ticketTypes: validTickets.map((t) => ({
            name: t.name,
            price: isPaid ? t.price : 0,
            quantity: t.quantity,
            description: t.description,
          })),
          questions,
        }),
      });

      const result = await response.json();

      if (result.success) {
        alert("Event created successfully!");
        router.push("/host/dashboard");
      } else {
        alert(result.error?.message || "Failed to create event");
      }
    } catch {
      alert("Failed to connect to server. Make sure backend is running.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Block render until the auth guard resolves; if denied we're redirecting.
  if (authorized === undefined) {
    return (
      <div className="min-h-screen bg-[#fbf9f6] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-[#522C5D] border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (authorized === false) {
    return (
      <div className="min-h-screen bg-[#fbf9f6] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-[#29104A] mb-2">Sign in required</h2>
          <p className="text-[#6B597F]">
            You need a host account to create events. Redirecting to sign in…
          </p>
        </div>
      </div>
    );
  }

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
        <Sidebar current={step} onChange={setStep} isStepEnabled={isStepEnabled} />

        <div className="flex-1">
          {step === "basics" && (
            <EventBasics
              onNext={handleBasicsSubmit}
              onChange={handleBasicsChange}
              initialData={eventData.basics}
            />
          )}
          {step === "describe" && (
            <DescribeEvent
              onNext={handleDescribeSubmit}
              onChange={handleDescribeChange}
              initialData={eventData.describe}
            />
          )}
          {step === "location" && (
            <EventLocation
              onNext={handleLocationSubmit}
              onChange={handleLocationChange}
              initialData={eventData.location}
            />
          )}
          {step === "tickets" && (
            <Tickets
              onNext={handleTicketsSubmit}
              onChange={handleTicketsChange}
              initialData={eventData.tickets}
            />
          )}
          {step === "form" && (
            <RegistrationForm
              onSubmit={handleFinalSubmit}
              onChange={handleFormChange}
              isSubmitting={isSubmitting}
              initialData={eventData.form}
            />
          )}
        </div>
      </div>
    </div>
  );
}
