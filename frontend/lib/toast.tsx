"use client";

// Tiny module-level toast system. No React context needed — a plain event
// emitter that <Toaster/> subscribes to. SSR-safe: showToast() is a no-op on
// the server (no listeners), and the emitter holds no DOM references.

export type ToastType = "success" | "error" | "info";

export type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

type Listener = (toast: Toast) => void;

const listeners = new Set<Listener>();
let nextId = 1;

/**
 * Show a toast. Safe to call from anywhere (client only — on the server there
 * are simply no subscribers, so it does nothing).
 */
export function showToast(message: string, type: ToastType = "info"): void {
  const toast: Toast = { id: nextId++, message, type };
  listeners.forEach((listener) => listener(toast));
}

/** Subscribe to toast events. Returns an unsubscribe function. */
export function subscribeToToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
