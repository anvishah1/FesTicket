import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import RelatedEvents from "./RelatedEvents";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ev(id: number, over: any = {}) {
  return { id, name: `Event ${id}`, startDate: null, venue: null, image: null, category: "Concert", ...over };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockFetch(festData: any[], catData: any[]) {
  globalThis.fetch = vi.fn((url: string | URL) => {
    const u = String(url);
    const data = u.includes("festId=") ? festData : u.includes("category=") ? catData : [];
    return Promise.resolve({ json: async () => ({ success: true, data }) });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(() => {
  push.mockReset();
});

describe("RelatedEvents (SEO-07)", () => {
  it("renders both rails, removes the current event, and dedupes across rails", async () => {
    // fest rail source includes the current event (1) and 2,3; category source
    // includes current (1), 3 (already in fest rail) and 4.
    mockFetch([ev(1), ev(2), ev(3)], [ev(1), ev(3), ev(4)]);

    render(<RelatedEvents eventId={1} festId={10} festName="Fest X" category="Concert" />);

    expect(await screen.findByText("More at Fest X")).toBeInTheDocument();
    expect(screen.getByText("Similar Concert events")).toBeInTheDocument();

    // current event never appears
    expect(screen.queryByText("Event 1")).not.toBeInTheDocument();
    // fest rail has 2 and 3
    expect(screen.getByText("Event 2")).toBeInTheDocument();
    expect(screen.getByText("Event 3")).toBeInTheDocument();
    // category rail has only 4 (3 was deduped out) -> Event 3 appears exactly once
    expect(screen.getByText("Event 4")).toBeInTheDocument();
    expect(screen.getAllByText("Event 3")).toHaveLength(1);
  });

  it("hides the fest rail when festId is null", async () => {
    mockFetch([], [ev(5), ev(6)]);
    render(<RelatedEvents eventId={1} festId={null} festName={null} category="Concert" />);
    expect(await screen.findByText("Similar Concert events")).toBeInTheDocument();
    expect(screen.queryByText(/More at/)).not.toBeInTheDocument();
    // no festId -> the fest endpoint is never queried
    const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(calls.some((u) => u.includes("festId="))).toBe(false);
  });

  it("renders nothing when every candidate is the current event", async () => {
    mockFetch([ev(1)], [ev(1)]);
    const { container } = render(<RelatedEvents eventId={1} festId={10} festName="Fest X" category="Concert" />);
    await waitFor(() => {
      expect(screen.queryByText(/More at|Similar/)).not.toBeInTheDocument();
    });
    expect(container).toBeEmptyDOMElement();
  });
});
