"use client";

import { useState, useRef, useEffect } from "react";
import { FALLBACK_POSTER } from "@/lib/images";
import { showToast } from "@/lib/toast";

interface EventBasicsProps {
  onNext: (data: EventBasicsData) => void;
  /** Fires on every edit so the wizard can persist in-progress input (H11). */
  onChange?: (data: EventBasicsData) => void;
  initialData?: EventBasicsData;
}

// The backend caps `image` at 2000 chars (validators/eventValidator.js), so an
// uploaded data URI must be compressed hard to fit. We downscale/re-encode and,
// if it still won't fit, reject inline instead of failing at final submit (H10).
const MAX_IMAGE_DATA_URL = 2000;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // reject huge files before decoding

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read-failed"));
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode-failed"));
    img.src = src;
  });
}

/** Draw the image into a JPEG data URL scaled so its longest side <= maxDim. */
function drawToJpeg(img: HTMLImageElement, maxDim: number, quality: number): string {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return "";
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Compress client-side, progressively shrinking until it fits MAX_IMAGE_DATA_URL.
 * Returns the smallest attempt if nothing fits (caller reports an inline error).
 */
async function compressImage(file: File): Promise<string> {
  const original = await readFileAsDataURL(file);
  const img = await loadImage(original);
  const attempts: { dim: number; q: number }[] = [
    { dim: 1200, q: 0.8 },
    { dim: 900, q: 0.75 },
    { dim: 700, q: 0.7 },
    { dim: 500, q: 0.6 },
    { dim: 400, q: 0.55 },
    { dim: 320, q: 0.5 },
  ];
  let smallest = "";
  for (const a of attempts) {
    const out = drawToJpeg(img, a.dim, a.q);
    if (!out) continue;
    if (!smallest || out.length < smallest.length) smallest = out;
    if (out.length <= MAX_IMAGE_DATA_URL) return out;
  }
  if (!smallest) throw new Error("encode-failed");
  return smallest;
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
    url: FALLBACK_POSTER,
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

export default function EventBasics({ onNext, onChange, initialData }: EventBasicsProps) {
  const [formData, setFormData] = useState<EventBasicsData>(initialData || {
    name: "",
    shortDescription: "",
    image: null,
    startDate: "",
    endDate: "",
    visibility: "PRIVATE",
    eventType: "OFFLINE",
  });

  // Report every edit up so switching steps via the Sidebar never loses input.
  useEffect(() => {
    onChange?.(formData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  const [showDefaultImages, setShowDefaultImages] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
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
      showToast("Invalid year format. Please enter a valid year.", "error");
      return;
    }

    const selected = new Date(value);
    const now = new Date();

    if (selected < now) {
      showToast("Start date cannot be in the past.", "error");
      return;
    }

    // Re-validate the end date against the *new* start: if an end date was
    // already chosen and now sits on/before the start, drop it so we never
    // keep an end-before-start pair (previously only checked on end change).
    if (formData.endDate) {
      const end = new Date(formData.endDate);
      if (end <= selected) {
        showToast("End date must be after the start date — please pick it again.", "error");
        setFormData({ ...formData, startDate: value, endDate: "" });
        return;
      }
    }

    setFormData({ ...formData, startDate: value });
  };

  const handleEndDateChange = (value: string) => {

    if (!value) return;

    const year = value.split("-")[0];

    if (year.length !== 4) {
      showToast("Invalid year format. Please enter a valid year.", "error");
      return;
    }

    if (!formData.startDate) {
      showToast("Select start date first", "error");
      return;
    }

    const end = new Date(value);
    const start = new Date(formData.startDate);

    if (end <= start) {
      showToast("End date must be after start date.", "error");
      return;
    }

    setFormData({ ...formData, endDate: value });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so re-selecting the same file re-triggers onChange.
    e.target.value = "";
    if (!file) return;

    setImageError(null);

    // --- Early, inline validation (no silent late failure at submit) ---
    if (!file.type.startsWith("image/")) {
      setImageError("Please choose an image file (JPG, PNG, WEBP, etc.).");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setImageError("That image is over 8MB. Please pick a smaller file.");
      return;
    }

    setImageBusy(true);
    try {
      const dataUrl = await compressImage(file);
      if (dataUrl.length > MAX_IMAGE_DATA_URL) {
        // Even fully downscaled it won't fit the server's image field.
        setImageError(
          "This image is too large to store. Please choose a simpler/smaller image, or pick a default image below."
        );
        return;
      }
      setFormData((prev) => ({ ...prev, image: dataUrl }));
      setShowDefaultImages(false);
    } catch {
      setImageError("Could not process this image. Please try another file or pick a default image.");
    } finally {
      setImageBusy(false);
    }
  };

  const handleSelectDefaultImage = (url: string) => {
    setImageError(null);
    setFormData({ ...formData, image: url });
    setShowDefaultImages(false);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      showToast("Please enter an event name", "error");
      return;
    }
    onNext(formData);
  };

  return (
    <div className="flex-1 rounded-xl border border-[var(--border-card)] bg-[var(--surface)] p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-semibold text-[var(--text-primary)]">
        Event Basics
      </h2>

      <div className="space-y-6">
        {/* Event Image */}
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
            Event Image <span className="text-[var(--text-secondary)]">*</span>
          </label>
          <p className="text-xs text-[var(--text-muted)] mb-3">
            Recommended: Square image (1:1) or landscape. Will be displayed at 320px height.
          </p>
          
          {formData.image && (
            <div className="mb-4 relative group">
              <div className="w-full h-80 bg-[color-mix(in_srgb,var(--surface-card)_20%,transparent)] rounded-xl overflow-hidden border border-[var(--border-card)]">
                <img 
                  src={formData.image} 
                  alt="Event" 
                  className="w-full h-full object-cover"
                />
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, image: null })}
                className="absolute top-3 right-3 p-2 bg-[color-mix(in_srgb,var(--fill-ink)_80%,transparent)] text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--fill-ink)]"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="absolute bottom-3 left-3 px-2 py-1 bg-[color-mix(in_srgb,var(--fill-ink)_80%,transparent)] text-white text-xs rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                This is how it will appear in event cards
              </div>
            </div>
          )}
          
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-[var(--border-card)] rounded-xl text-[var(--text-muted)] hover:border-[var(--border-plum)] hover:text-[var(--text-secondary)] transition-colors"
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
                  ? "border-[var(--border-plum)] bg-[color-mix(in_srgb,var(--fill-plum)_10%,transparent)] text-[var(--text-secondary)]" 
                  : "border-[var(--border-card)] text-[var(--text-muted)] hover:border-[var(--border-plum)] hover:text-[var(--text-secondary)]"
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

          {imageBusy && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">Optimizing image…</p>
          )}
          {imageError && (
            <p className="mt-2 text-xs text-red-600" role="alert">
              {imageError}
            </p>
          )}

          {showDefaultImages && (
            <div className="mt-4 p-4 bg-[color-mix(in_srgb,var(--surface-card)_20%,transparent)] rounded-xl">
              <p className="text-sm text-[var(--text-muted)] mb-3">Select a default image (all sized for event cards):</p>
              <div className="grid grid-cols-4 gap-3">
                {defaultImages.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => handleSelectDefaultImage(img.url)}
                    className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                      formData.image === img.url 
                        ? "border-[var(--border-plum)] ring-2 ring-[color-mix(in_srgb,var(--ring-plum)_30%,transparent)]" 
                        : "border-transparent hover:border-[color-mix(in_srgb,var(--border-plum)_50%,transparent)]"
                    }`}
                  >
                    <div className="w-full h-24 bg-[color-mix(in_srgb,var(--surface-card)_20%,transparent)]">
                      <img 
                        src={img.url} 
                        alt={img.label} 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute inset-0 bg-[color-mix(in_srgb,var(--fill-ink)_60%,transparent)] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xs font-medium">{img.label}</span>
                    </div>
                    {formData.image === img.url && (
                      <div className="absolute top-1 right-1 w-5 h-5 bg-[var(--fill-plum)] rounded-full flex items-center justify-center">
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
          <label htmlFor="event-name" className="block text-sm font-medium text-[var(--text-primary)]">
            Event Name <span className="text-[var(--text-secondary)]">*</span>
          </label>
          <input
            id="event-name"
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="eg: KSUM Investor's Meet"
            className="mt-2 w-full rounded-lg border border-[var(--border-card)] px-4 py-2 focus:border-[var(--border-plum)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:outline-none text-[var(--text-primary)]"
          />
        </div>

        {/* Short Description */}
        <div>
          <label htmlFor="event-short-description" className="block text-sm font-medium text-[var(--text-primary)]">
            Short Description
          </label>
          <textarea
            id="event-short-description"
            rows={2}
            value={formData.shortDescription}
            onChange={(e) => setFormData({ ...formData, shortDescription: e.target.value })}
            placeholder="Describe your event in one or two lines"
            className="mt-2 w-full rounded-lg border border-[var(--border-card)] px-4 py-2 focus:border-[var(--border-plum)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)] focus:outline-none text-[var(--text-primary)]"
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">

          <div>
            <label htmlFor="event-start-date" className="block text-sm font-medium text-[var(--text-primary)]">
              Event Starts From
            </label>

            {/*
              The real <input type="datetime-local"> is layered over the whole
              control (inset-0, opacity-0 but pointer-events enabled) so it is
              both click- AND keyboard-operable (Tab to focus, type/arrow keys or
              Space/Enter open the native picker). The formatted text below is a
              purely visual proxy. Fixes WCAG 2.1.1 (previously the input was
              pointer-events:none and only a click handler on the div worked).
            */}
            <div
              className="relative mt-2 flex items-center justify-between w-full rounded-lg border border-[var(--border-card)] px-4 py-3
                        focus-within:border-[var(--border-plum)] focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)]
                        hover:border-[var(--border-plum)] transition"
            >
              <span className="text-[var(--text-primary)]" aria-hidden="true">
                {formData.startDate
                  ? new Date(formData.startDate).toLocaleString()
                  : "Select date & time"}
              </span>

              <svg
                className="w-5 h-5 text-[var(--text-muted)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z"
                />
              </svg>

              <input
                ref={startDateRef}
                id="event-start-date"
                type="datetime-local"
                value={formData.startDate}
                min={getMinDateTime()}
                onChange={(e) => handleStartDateChange(e.target.value)}
                onClick={() => startDateRef.current?.showPicker?.()}
                className="absolute inset-0 h-full w-full cursor-pointer rounded-lg opacity-0"
              />
            </div>
          </div>

          <div>
            <label htmlFor="event-end-date" className="block text-sm font-medium text-[var(--text-primary)]">
              Event Ends On
            </label>

            <div
              className="relative mt-2 flex items-center justify-between w-full rounded-lg border border-[var(--border-card)] px-4 py-3
                        focus-within:border-[var(--border-plum)] focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--ring-plum)_20%,transparent)]
                        hover:border-[var(--border-plum)] transition"
            >
              <span className="text-[var(--text-primary)]" aria-hidden="true">
                {formData.endDate
                  ? new Date(formData.endDate).toLocaleString()
                  : "Select date & time"}
              </span>

              <svg
                className="w-5 h-5 text-[var(--text-muted)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10m-11 9h12a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v11a2 2 0 002 2z"
                />
              </svg>

              <input
                ref={endDateRef}
                id="event-end-date"
                type="datetime-local"
                value={formData.endDate}
                min={formData.startDate || getMinDateTime()}
                onChange={(e) => handleEndDateChange(e.target.value)}
                onClick={() => endDateRef.current?.showPicker?.()}
                className="absolute inset-0 h-full w-full cursor-pointer rounded-lg opacity-0"
              />
            </div>
          </div>

        </div>

        {/* Visibility */}
        <div>
          <span id="event-visibility-label" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">
            Event Visibility
          </span>
          <div className="flex gap-4" role="group" aria-labelledby="event-visibility-label">
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
          <span id="event-type-label" className="mb-2 block text-sm font-medium text-[var(--text-primary)]">
            Event Type
          </span>
          <div className="flex gap-4" role="group" aria-labelledby="event-type-label">
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
          className="mt-6 w-full rounded-lg bg-[var(--fill-plum)] py-3 text-white font-medium hover:bg-[var(--fill-ink)] transition"
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
      aria-pressed={active}
      onClick={onClick}
      className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition
        ${
          active
            ? "border-[var(--border-plum)] bg-[color-mix(in_srgb,var(--fill-plum)_10%,transparent)] text-[var(--text-secondary)]"
            : "border-[var(--border-card)] bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--surface-card)_20%,transparent)]"
        }`}
    >
      {label}
    </button>
  );
}
