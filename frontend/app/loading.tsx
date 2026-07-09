export default function Loading() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ backgroundColor: "var(--surface-page)" }}
      role="status"
      aria-live="polite"
    >
      <span
        className="inline-block h-10 w-10 rounded-full border-4 border-t-transparent animate-spin"
        style={{ borderColor: "var(--border-plum)", borderTopColor: "transparent" }}
      />
      <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
        Loading…
      </p>
      <span className="sr-only">Loading</span>
    </div>
  );
}
