import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ForgotPasswordPage from "./page";

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe("ForgotPasswordPage", () => {
  it("POSTs the email to /api/auth/forgot-password and shows the generic success state", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: "If this email exists, a reset link was sent." }),
    });

    render(<ForgotPasswordPage />);

    await userEvent.type(screen.getByPlaceholderText("you@school.edu"), "student@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset email/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain("/api/auth/forgot-password");
    expect(call[1].method).toBe("POST");
    const body = JSON.parse(call[1].body);
    expect(body.email).toBe("student@example.com");

    await screen.findByText(/if an account exists for that email/i);
  });

  it("shows a network error when the request fails", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));

    render(<ForgotPasswordPage />);

    await userEvent.type(screen.getByPlaceholderText("you@school.edu"), "student@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset email/i }));

    await screen.findByText(/could not reach server/i);
  });

  it("shows an error state instead of a false success when the backend returns a real error", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ success: false, error: { code: "SERVER_ERROR", message: "Server error" } }),
    });

    render(<ForgotPasswordPage />);

    await userEvent.type(screen.getByPlaceholderText("you@school.edu"), "student@example.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset email/i }));

    await screen.findByText(/something went wrong/i);
    expect(screen.queryByText(/if an account exists for that email/i)).not.toBeInTheDocument();
  });
});
