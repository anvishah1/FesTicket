import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventCreatePage from "./page";
import { setAuth } from "@/lib/auth";

const replace = vi.fn();
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ festId: "1" }),
  useRouter: () => ({ push, replace, back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/host/fests/1/events/create",
}));

// The wizard alerts on validation failures; stub it so tests stay quiet.
vi.spyOn(window, "alert").mockImplementation(() => {});

function festOk() {
  return {
    ok: true,
    json: async () => ({
      success: true,
      data: { id: 1, name: "TechFest", college: "IIT" },
    }),
  };
}

function loginAsHost() {
  setAuth("access-token", "refresh-token", {
    id: 7,
    email: "host@example.com",
    role: "HOST",
    profileCompleted: true,
    editorFestId: 1,
  });
}

beforeEach(() => {
  replace.mockClear();
  push.mockClear();
  window.localStorage.clear();
  globalThis.fetch = vi.fn().mockResolvedValue(festOk());
});

describe("EventCreatePage auth guard", () => {
  it("redirects unauthenticated users to /signin and never shows the wizard", async () => {
    render(<EventCreatePage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/signin"));
    expect(screen.getByText(/sign in required/i)).toBeInTheDocument();
    // No wizard step heading renders for a denied user.
    expect(
      screen.queryByRole("heading", { name: "Event Basics" })
    ).not.toBeInTheDocument();
  });

  it("renders the wizard for an authenticated host", async () => {
    loginAsHost();
    render(<EventCreatePage />);
    expect(
      await screen.findByRole("heading", { name: "Event Basics" })
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("EventCreatePage wizard robustness", () => {
  it("preserves a step's edits when navigating away and back via the Sidebar (H11)", async () => {
    loginAsHost();
    render(<EventCreatePage />);

    const nameInput = await screen.findByPlaceholderText(
      "eg: KSUM Investor's Meet"
    );
    await userEvent.type(nameInput, "My Event");

    // Jump to Describe (unlocked now that basics has a name) WITHOUT clicking
    // Save & Continue, then back to Event Basics via the Sidebar.
    await userEvent.click(screen.getByText("Describe Your Event"));
    await screen.findByRole("heading", { name: "Describe Your Event" });
    await userEvent.click(screen.getByText("Event Basics"));

    // The typed name survived the round-trip.
    const nameAgain = await screen.findByPlaceholderText(
      "eg: KSUM Investor's Meet"
    );
    expect(nameAgain).toHaveValue("My Event");
  });

  it("locks the Registration Form (submit) step until tickets and venue exist (H12)", async () => {
    loginAsHost();
    render(<EventCreatePage />);

    const nameInput = await screen.findByPlaceholderText(
      "eg: KSUM Investor's Meet"
    );
    await userEvent.type(nameInput, "My Event");

    // Basics is complete, but there are still no tickets and no location, so
    // the final (publishing) step must stay locked — no skip-to-submit.
    // (Locked steps use aria-disabled to stay focusable for AT, not the native
    // disabled attribute, so their onClick nav is gated instead.)
    const formBtn = screen.getByText("Registration Form").closest("button")!;
    expect(formBtn).toHaveAttribute("aria-disabled", "true");
    // A middle step is reachable though.
    const locationBtn = screen.getByText("Event Location").closest("button")!;
    expect(locationBtn).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("EventCreatePage custom questions persistence (C4)", () => {
  it("includes the mapped questions array in the POST /api/events body", async () => {
    loginAsHost();
    render(<EventCreatePage />);

    // Basics: give the event a name (unlocks the rest of the wizard).
    const nameInput = await screen.findByPlaceholderText(
      "eg: KSUM Investor's Meet"
    );
    await userEvent.type(nameInput, "My Event");

    // Location: an offline venue makes locationComplete true.
    await userEvent.click(screen.getByText("Event Location"));
    const venue = await screen.findByPlaceholderText("eg: Kerala Startup Mission");
    await userEvent.type(venue, "Main Auditorium");

    // Tickets: the default ticket is already valid; visiting the step reports
    // it up so ticketsComplete becomes true.
    await userEvent.click(screen.getByText("Tickets"));
    await screen.findByRole("heading", { name: "Tickets" });

    // Registration Form: now unlocked. Configure a custom question.
    const formNav = screen.getByText("Registration Form").closest("button")!;
    await waitFor(() => expect(formNav).not.toBeDisabled());
    await userEvent.click(formNav);
    await screen.findByRole("heading", { name: "Registration Form" });

    const label = screen.getByDisplayValue("Why do you want to attend this event?");
    await userEvent.clear(label);
    await userEvent.type(label, "How old are you?");
    await userEvent.selectOptions(
      screen.getByLabelText("Answer type for question 1"),
      "number"
    );
    await userEvent.click(screen.getByLabelText("Required"));

    await userEvent.click(screen.getByRole("button", { name: "Create Event" }));

    // Find the POST /api/events call and assert the questions payload.
    await waitFor(() => {
      const post = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (c) =>
          typeof c[0] === "string" &&
          c[0].endsWith("/api/events") &&
          (c[1] as RequestInit | undefined)?.method === "POST"
      );
      expect(post).toBeTruthy();
    });

    const post = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        c[0].endsWith("/api/events") &&
        (c[1] as RequestInit | undefined)?.method === "POST"
    )!;
    const body = JSON.parse((post[1] as RequestInit).body as string);
    expect(body.questions).toEqual([
      { label: "How old are you?", type: "number", required: true, order: 0 },
    ]);
  });
});
