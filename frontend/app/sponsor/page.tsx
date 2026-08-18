import type { Metadata } from "next";
import SponsorForm from "./SponsorForm";

// A Server Component wrapper purely so this route can have its own <title> —
// the form itself is a "use client" component (state-heavy) and client
// components can't export metadata. Without this, the page fell through to
// the root layout's generic default title instead of a page-specific one.
export const metadata: Metadata = {
  title: "Sponsor an Event",
  description: "Partner with FesTicket and showcase your brand to college fest attendees.",
};

export default function SponsorPage() {
  return <SponsorForm />;
}
