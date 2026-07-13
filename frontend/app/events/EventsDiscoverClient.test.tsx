import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("constrains the 'to' picker to on-or-after the chosen 'from'", () => {
    renderIt();
    const { from, to } = getInputs();

    fireEvent.change(from, { target: { value: "2026-08-10" } });

    // The native picker itself can no longer offer an earlier end date.
    expect(to.min).toBe("2026-08-10");
  });

  it("constrains the 'from' picker to on-or-before the chosen 'to'", () => {
    renderIt();
    const { from, to } = getInputs();

    fireEvent.change(to, { target: { value: "2026-08-20" } });

    expect(from.max).toBe("2026-08-20");
  });

  it("clamps 'to' forward when 'from' is moved past it (never leaves from > to)", () => {
    renderIt();
    const { from, to } = getInputs();

    fireEvent.change(from, { target: { value: "2026-08-01" } });
    fireEvent.change(to, { target: { value: "2026-08-05" } });
    // Now push the start beyond the end.
    fireEvent.change(from, { target: { value: "2026-08-09" } });

    expect(from.value).toBe("2026-08-09");
    expect(to.value).toBe("2026-08-09"); // dragged along, not left inverted
  });

  it("clamps 'from' backward when 'to' is moved before it", () => {
    renderIt();
    const { from, to } = getInputs();

    fireEvent.change(from, { target: { value: "2026-08-10" } });
    fireEvent.change(to, { target: { value: "2026-08-02" } });

    expect(to.value).toBe("2026-08-02");
    expect(from.value).toBe("2026-08-02");
  });
});
