import { describe, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminSignUpPage from "./page";

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

async function fillAndSubmit() {
  render(<AdminSignUpPage />);
  await userEvent.type(screen.getByPlaceholderText("you@college.edu"), "prof@college.edu");
  await userEvent.type(screen.getByPlaceholderText(/ComicCon/i), "TechFest");
  await userEvent.click(screen.getByRole("button", { name: /submit request/i }));
}

describe("AdminSignUpPage", () => {
  it("shows the confirmation screen on a successful (enveloped) response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { id: 1 }, message: "Request received." }),
    });

    await fillAndSubmit();

    await screen.findByText(/request submitted/i);
  });

  // ARCH-01: the backend now returns {success:false, error:{code,message}}
  // instead of a bare {message}. Reading the old `data.error` (a string) or
  // `data.message` would render an object into JSX and crash.
  it("shows the server's error message from the unified envelope on failure", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: { code: "CONFLICT", message: "You already have a pending admin request." },
      }),
    });

    await fillAndSubmit();

    await screen.findByText("You already have a pending admin request.");
  });

  it("falls back to a generic message when the error response has no message", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, error: {} }),
    });

    await fillAndSubmit();

    await screen.findByText("Request failed.");
  });
});
