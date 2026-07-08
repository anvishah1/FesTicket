import { redirect } from "next/navigation";

// FE-07: the canonical event detail page is /events/[id]. This fest-scoped route
// is a pure server redirect (real HTTP 3xx, zero JS, no Header/skeleton flash,
// works with JavaScript disabled) instead of the old client component that
// hydrated and called router.replace. redirect() throws NEXT_REDIRECT by design
// — it must not be wrapped in a try/catch.
export default async function FestEventRedirectPage({
  params,
}: {
  params: Promise<{ festId: string; eventId: string }>;
}) {
  const { eventId } = await params;
  // A missing id sends the visitor to the discover page rather than /events/.
  redirect(eventId ? `/events/${encodeURIComponent(eventId)}` : "/events");
}
