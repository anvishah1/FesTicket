import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EventsDiscoverClient from "./EventsDiscoverClient";

// The discovery date facet must never allow an inverted range (to < from).
// This had NO test coverage, which is how the missing constraint slipped through.
describe("EventsDiscoverClient — date range facet", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 0 } }),
    }) as unknown as typeof fetch;
  });

  const renderIt = () =>
    render(
      <EventsDiscoverClient
        initialEvents={[]}
        initialPagination={{ page: 1, limit: 12, total: 0, totalPages: 0 }}
      />
    );

  const getInputs = () => ({
    from: screen.getByLabelText("From date") as HTMLInputElement,
    to: screen.getByLabelText("To date") as HTMLInputElement,
  });

  // Every facet change re-fires the (mocked, async) events fetch effect. Awaiting
  // it here — rather than letting it resolve after the test body returns — keeps
  // that state update inside an act() boundary instead of warning/bleeding into
  // whichever test runs next.
  const flushFetch = () => waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

  it("constrains the 'to' picker to on-or-after the chosen 'from'", async () => {
    renderIt();
    const { from, to } = getInputs();

    fireEvent.change(from, { target: { value: "2026-08-10" } });
    await flushFetch();

    // The native picker itself can no longer offer an earlier end date.
    expect(to.min).toBe("2026-08-10");
  });

  it("constrains the 'from' picker to on-or-before the chosen 'to'", async () => {
    renderIt();
    const { from, to } = getInputs();

    fireEvent.change(to, { target: { value: "2026-08-20" } });
    await flushFetch();

    expect(from.max).toBe("2026-08-20");
  });

  it("clamps 'to' forward when 'from' is moved past it (never leaves from > to)", async () => {
    renderIt();
    const { from, to } = getInputs();

    fireEvent.change(from, { target: { value: "2026-08-01" } });
    fireEvent.change(to, { target: { value: "2026-08-05" } });
    // Now push the start beyond the end.
    fireEvent.change(from, { target: { value: "2026-08-09" } });
    await flushFetch();

    expect(from.value).toBe("2026-08-09");
    expect(to.value).toBe("2026-08-09"); // dragged along, not left inverted
  });

  it("clamps 'from' backward when 'to' is moved before it", async () => {
    renderIt();
    const { from, to } = getInputs();

    fireEvent.change(from, { target: { value: "2026-08-10" } });
    fireEvent.change(to, { target: { value: "2026-08-02" } });
    await flushFetch();

    expect(to.value).toBe("2026-08-02");
    expect(from.value).toBe("2026-08-02");
  });
});

// A failed request must not be indistinguishable from a genuine zero-result
// search — it used to collapse into the same "No events match your filters"
// copy either way.
describe("EventsDiscoverClient — fetch failure vs. genuine empty result", () => {
  const renderIt = () =>
    render(
      <EventsDiscoverClient
        initialEvents={null}
        initialPagination={null}
      />
    );

  it("shows an error state with a retry action on a server error, not the empty-filters message", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: { code: "SERVER_ERROR" } }),
    }) as unknown as typeof fetch;

    renderIt();

    await screen.findByText(/something went wrong/i);
    expect(screen.queryByText(/no events match your filters/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("shows the empty-filters message (not an error) when the request genuinely succeeds with zero results", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 0 } }),
    }) as unknown as typeof fetch;

    renderIt();

    await screen.findByText(/no events match your filters/i);
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("retries the request when the retry button is clicked", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ success: false }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 0 } }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderIt();
    await screen.findByText(/something went wrong/i);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await screen.findByText(/no events match your filters/i);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
