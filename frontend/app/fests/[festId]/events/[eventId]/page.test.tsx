import { describe, it, expect, vi, beforeEach } from "vitest";
import FestEventRedirectPage from "./page";

// FE-07: the page is now an async Server Component that calls redirect(). redirect
// throws NEXT_REDIRECT; mock it so we can assert the target without the throw.
const redirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirect(url),
}));

beforeEach(() => redirect.mockClear());

describe("Fest event route (server redirect)", () => {
  it("redirects to the canonical /events/[id] page", async () => {
    await FestEventRedirectPage({ params: Promise.resolve({ festId: "1", eventId: "42" }) });
    expect(redirect).toHaveBeenCalledWith("/events/42");
  });

  it("encodes the event id in the redirect target", async () => {
    await FestEventRedirectPage({ params: Promise.resolve({ festId: "1", eventId: "a b" }) });
    expect(redirect).toHaveBeenCalledWith("/events/a%20b");
  });

  it("falls back to /events when the id is missing", async () => {
    await FestEventRedirectPage({ params: Promise.resolve({ festId: "1", eventId: "" }) });
    expect(redirect).toHaveBeenCalledWith("/events");
  });
});
