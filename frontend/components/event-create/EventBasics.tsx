"use client";

import { useState, useRef } from "react";

interface EventBasicsProps {
  onNext: (data: EventBasicsData) => void;
  initialData?: EventBasicsData;
}

export interface EventBasicsData {
  name: string;
  shortDescription: string;
  image: string | null;
  startDate: string;
  endDate: string;
  visibility: "PRIVATE" | "PUBLIC";
  eventType: "OFFLINE" | "ONLINE";
}

const defaultImages = [
  {
    id: 1,
    url: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=400&h=400&fit=crop",
    label: "Concert"
  },
  {
    id: 2,
    url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&h=400&fit=crop",
    label: "EDM/DJ"
  },
  {
    id: 3,
    url: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=400&h=400&fit=crop",
    label: "Robotics"
  },
  {
    id: 4,
    url: "https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=400&h=400&fit=crop",
    label: "Tech"
  },
  {
    id: 5,
    url: "https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=400&h=400&fit=crop",
    label: "Drone"
  },
  {
    id: 6,
    url: "https://images.unsplash.com/photo-1509281373149-e957c6296406?w=400&h=400&fit=crop",
    label: "Gaming"
  },
  {
    id: 7,
    url: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400&h=400&fit=crop",
    label: "Hackathon"
  },
  {
    id: 8,
    url: "https://images.unsplash.com/photo-1508700929628-666bc8bd84ea?w=400&h=400&fit=crop",
    label: "Dance"
  },
];

export default function EventBasics({ onNext, initialData }: EventBasicsProps) {
  const [formData, setFormData] = useState<EventBasicsData>(initialData || {
    name: "",
    shortDescription: "",
    image: null,
    startDate: "",
    endDate: "",
    visibility: "PRIVATE",
    eventType: "OFFLINE",
  });
  
  const [showDefaultImages, setShowDefaultImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  const getMinDateTime = () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  };

  const handleStartDateChange = (value: string) => {

    if (!value) return;

    const year = value.split("-")[0];

    if (year.length !== 4) {
      alert("Invalid year format. Please enter a valid year.");
      return;
    }

    const selected = new Date(value);
    const now = new Date();

    if (selected < now) {
      alert("Start date cannot be in the past.");
      return;
    }

    setFormData({ ...formData, startDate: value });
  };

  const handleEndDateChange = (value: string) => {

    if (!value) return;

    const year = value.split("-")[0];

    if (year.length !== 4) {
      alert("Invalid year format. Please enter a valid year.");
      return;
    }

    if (!formData.startDate) {
      alert("Select start date first");
      return;
    }

    const end = new Date(value);
    const start = new Date(formData.startDate);

    if (end <= start) {
      alert("End date must be after start date.");
      return;
    }

    setFormData({ ...formData, endDate: value });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, image: reader.result as string });
        setShowDefaultImages(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSelectDefaultImage = (url: string) => {
    setFormData({ ...formData, image: url });
    setShowDefaultImages(false);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      alert("Please enter an event name");
      return;
    }
    onNext(formData);
  };

  return (
    <div className="flex-1 rounded-xl border border-[#C5BAC4] bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-semibold text-[#29104A]">
        Event Basics
      </h2>

      <div className="space-y-6">
        {/* Event Image */}
        <div>
          <label className="block text-sm font-medium text-[#29104A] mb-2">
            Event Image <span className="text-[#522C5D]">*</span>
          </label>
          <p className="text-xs text-[#6B597F] mb-3">
            Recommended: Square image (1:1) or landscape. Will be displayed at 320px height.
          </p>
          
          {formData.image && (
            <div className="mb-4 relative group">
              <div className="w-full h-80 bg-[#C5BAC4]/20 rounded-xl overflow-hidden border border-[#C5BAC4]">
                <img 
                  src={formData.image} 
                  alt="Event" 
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, image: null })}
                className="absolute top-3 right-3 p-2 bg-[#29104A]/80 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[#29104A]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="absolute bottom-3 left-3 px-2 py-1 bg-[#29104A]/80 text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                This is how it will appear in event cards
              </div>
            </div>
          )}
          
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-[#C5BAC4] rounded-xl text-[#6B597F] hover:border-[#522C5D] hover:text-[#522C5D] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Upload Image
            </button>
            <button
              type="button"
              onClick={() => setShowDefaultImages(!showDefaultImages)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 rounded-xl transition-colors ${
                showDefaultImages 
                  ? "border-[#522C5D] bg-[#522C5D]/10 text-[#522C5D]" 
                  : "border-[#C5BAC4] text-[#6B597F] hover:border-[#522C5D] hover:text-[#522C5D]"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Choose Default
            </button>
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileUpload}
            className="hidden"
          />
          
          {showDefaultImages && (
            <div className="mt-4 p-4 bg-[#C5BAC4]/20 rounded-xl">
              <p className="text-sm text-[#6B597F] mb-3">Select a default image (all sized for event cards):</p>
              <div className="grid grid-cols-4 gap-3">
                {defaultImages.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => handleSelectDefaultImage(img.url)}
                    className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                      formData.image === img.url 
                        ? "border-[#522C5D] ring-2 ring-[#522C5D]/30" 
                        : "border-transparent hover:border-[#522C5D]/50"
                    }`}
                  >
                    <div className="w-full h-24 bg-[#C5BAC4]/20">
                      <img 
                        src={img.url} 
                        alt={img.label} 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute inset-0 bg-[#29104A]/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xs font-medium">{img.label}</span>
                    </div>
                    {formData.image === img.url && (
                      <div className="absolute top-1 right-1 w-5 h-5 bg-[#522C5D] rounded-full flex items-center justify-center">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Event Name */}
        <div>
          <label className="block text-sm font-medium text-[#29104A]">
            Event Name <span className="text-[#522C5D]">*</span>
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="eg: KSUM Investor's Meet"
            className="mt-2 w-full rounded-lg border border-[#C5BAC4] px-4 py-2 focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 focus:outline-none text-[#29104A]"
          />
        </div>

        {/* Short Description */}
        <div>
          <label className="block text-sm font-medium text-[#29104A]">
            Short Description
          </label>
          <textarea
            rows={2}
            value={formData.shortDescription}
            onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
            placeholder="Describe your event in one or two lines"
            className="mt-2 w-full rounded-lg border border-[#C5BAC4] px-4 py-2 focus:border-[#522C5D] focus:ring-2 focus:ring-[#522C5D]/20 focus:outline-none text-[#29104A]"
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">

          <div>
            <label className="block text-sm font-medium text-[#29104A]">
              Event Starts From
            </label>

            <div
              onClick={() => startDateRef.current?.showPicker()}
              className="mt-2 flex items-center justify-between w-full rounded-lg border border-[#C5BAC4] px-4 py-3 cursor-pointer
                        focus-within:border-[#522C5D] focus-within:ring-2 focus-within:ring-[#522C5D]/20
                        hover:border-[#522C5D] transition"
            >
              <span className="text-[#29104A]">
                {formData.startDate
                  ? new Date(formData.startDate).toLocaleString()
                  : "Select date & time"}
              </span>

              <svg
                className="w-5 h-5 text-[#6B597F]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z"
                />
              </svg>

              <input
                ref={startDateRef}
                type="datetime-local"
                value={formData.startDate}
                min={getMinDateTime()}
                onChange={(e) => handleStartDateChange(e.target.value)}
                className="absolute opacity-0 pointer-events-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#29104A]">
              Event Ends On
            </label>

            <div
              onClick={() => endDateRef.current?.showPicker()}
              className="mt-2 flex items-center justify-between w-full rounded-lg border border-[#C5BAC4] px-4 py-3 cursor-pointer
                        focus-within:border-[#522C5D] focus-within:ring-2 focus-within:ring-[#522C5D]/20
                        hover:border-[#522C5D] transition"
            >
              <span className="text-[#29104A]">
                {formData.endDate
                  ? new Date(formData.endDate).toLocaleString()
                  : "Select date & time"}
              </span>

              <svg
                className="w-5 h-5 text-[#6B597F]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z"
                />
              </svg>

              <input
                ref={endDateRef}
                type="datetime-local"
                value={formData.endDate}
                min={formData.startDate || getMinDateTime()}
                onChange={(e) => handleEndDateChange(e.target.value)}
                className="absolute opacity-0 pointer-events-none"
              />
            </div>
          </div>

        </div>

        {/* Visibility */}
        <div>
          <label className="mb-2 block text-sm font-medium text-[#29104A]">
            Event Visibility
          </label>
          <div className="flex gap-4">
            <OptionButton 
              label="Private" 
              active={formData.visibility === "PRIVATE"} 
              onClick={() => setFormData({ ...formData, visibility: "PRIVATE" })}
            />
            <OptionButton 
              label="Public" 
              active={formData.visibility === "PUBLIC"} 
              onClick={() => setFormData({ ...formData, visibility: "PUBLIC" })}
            />
          </div>
        </div>

        {/* Event Type */}
        <div>
          <label className="mb-2 block text-sm font-medium text-[#29104A]">
            Event Type
          </label>
          <div className="flex gap-4">
            <OptionButton 
              label="Offline" 
              active={formData.eventType === "OFFLINE"} 
              onClick={() => setFormData({ ...formData, eventType: "OFFLINE" })}
            />
            <OptionButton 
              label="Online" 
              active={formData.eventType === "ONLINE"} 
              onClick={() => setFormData({ ...formData, eventType: "ONLINE" })}
            />
          </div>
        </div>

        {/* Save */}
        <button
          onClick={handleSubmit}
          className="mt-6 w-full rounded-lg bg-[#522C5D] py-3 text-white font-medium hover:bg-[#29104A] transition"
        >
          Save & Continue
        </button>
      </div>
    </div>
  );
}

function OptionButton({
  label,
  active = false,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition
        ${
          active
            ? "border-[#522C5D] bg-[#522C5D]/10 text-[#522C5D]"
            : "border-[#C5BAC4] bg-white text-[#6B597F] hover:bg-[#C5BAC4]/20"
        }`}
    >
      {label}
    </button>
  );
}
