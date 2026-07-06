"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ backgroundColor: "#fbf9f6" }}
    >
      <div className="w-full max-w-md text-center">
        <p
          className="text-sm font-semibold tracking-wide uppercase"
          style={{ color: "#522C5D" }}
        >
          tiqr
        </p>
        <h1
          className="mt-3 text-2xl font-bold"
          style={{ color: "#522C5D" }}
        >
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          An unexpected error occurred. You can try again — if it keeps
          happening, please come back in a little while.
        </p>
        <button
          onClick={reset}
          className="mt-6 inline-flex items-center justify-center rounded-lg px-6 py-3 font-medium text-white transition hover:opacity-90"
          style={{ backgroundColor: "#522C5D" }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
