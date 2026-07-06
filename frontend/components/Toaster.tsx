"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { subscribeToToasts, type Toast, type ToastType } from "@/lib/toast";

const AUTO_DISMISS_MS = 4000;

const TYPE_STYLES: Record<ToastType, string> = {
  success: "bg-[#1E7F4F] border-[#166139] text-white",
  error: "bg-[#B42318] border-[#8A1911] text-white",
  info: "bg-[#29104A] border-[#522C5D] text-[#DEDCDC]",
};

const TYPE_ICON: Record<ToastType, string> = {
  success: "M5 13l4 4L19 7",
  error: "M6 18L18 6M6 6l12 12",
  info: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
};

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Per-toast auto-dismiss timers, so hover can pause/resume an individual toast.
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((id: number) => {
    const handle = timers.current.get(id);
    if (handle) {
      clearTimeout(handle);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer]
  );

  const scheduleDismiss = useCallback(
    (id: number) => {
      clearTimer(id);
      timers.current.set(id, setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
    },
    [clearTimer, dismiss]
  );

  useEffect(() => {
    const unsubscribe = subscribeToToasts((toast) => {
      setToasts((prev) => [...prev, toast]);
      scheduleDismiss(toast.id);
    });
    return unsubscribe;
  }, [scheduleDismiss]);

  // Clear any pending timers on unmount.
  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((handle) => clearTimeout(handle));
      map.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 max-w-[calc(100vw-2rem)] w-full sm:w-auto pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          // Errors interrupt the user (assertive/alert); success & info wait
          // politely (status).
          role={toast.type === "error" ? "alert" : "status"}
          aria-live={toast.type === "error" ? "assertive" : "polite"}
          onMouseEnter={() => clearTimer(toast.id)}
          onMouseLeave={() => scheduleDismiss(toast.id)}
          className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg sm:min-w-[18rem] sm:max-w-sm ${TYPE_STYLES[toast.type]}`}
        >
          <svg
            className="w-5 h-5 flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={TYPE_ICON[toast.type]}
            />
          </svg>
          <p className="flex-1 text-sm font-medium leading-snug break-words">
            {toast.message}
          </p>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss notification"
            className="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
