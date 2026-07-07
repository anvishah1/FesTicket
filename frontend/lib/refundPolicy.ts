// PAY-06: human-readable copy for an event's buyer refund policy. Kept in one
// place so the booking page, confirmation, and My Bookings all describe a policy
// identically.
export type RefundPolicy = "NO_REFUND" | "FULL_ANYTIME" | "FULL_UNTIL_CUTOFF";

export function refundPolicyText(policy?: string | null, cutoffHours?: number | null): string {
  switch (policy) {
    case "FULL_ANYTIME":
      return "Full refund available any time before the event.";
    case "FULL_UNTIL_CUTOFF":
      return cutoffHours != null
        ? `Full refund available up to ${cutoffHours} hour${cutoffHours === 1 ? "" : "s"} before the event starts.`
        : "Full refund available before the event starts.";
    case "NO_REFUND":
    default:
      return "This booking is non-refundable.";
  }
}

// Whether a buyer can even attempt a self-service refund under a policy (used to
// decide if the My-Bookings button is shown; the server is authoritative on the
// cutoff window).
export function refundAllowedByPolicy(policy?: string | null): boolean {
  return policy === "FULL_ANYTIME" || policy === "FULL_UNTIL_CUTOFF";
}
