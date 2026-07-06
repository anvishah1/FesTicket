import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ResetPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams("token=reset-tok-123"),
  usePathname: () => "/reset",
}));

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));

beforeEach(() => {
  push.mockReset();
  globalThis.fetch = vi.fn();
});

describe("ResetPage", () => {
  it("POSTs the token from the URL plus the new password and shows success on ok", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ message: "Password reset successful" }),
    });

    render(<ResetPage />);

    await userEvent.type(screen.getByPlaceholderText("At least 8 characters"), "NewPassword1!");
    await userEvent.type(screen.getByPlaceholderText("Repeat new password"), "NewPassword1!");
    await userEvent.click(screen.getByRole("button", { name: /set new password/i }));

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain("/api/auth/reset-password");
    expect(call[1].method).toBe("POST");
    const body = JSON.parse(call[1].body);
    expect(body.token).toBe("reset-tok-123");
    expect(body.newPassword).toBe("NewPassword1!");

    await screen.findByText(/password updated/i);
  });

  it("shows the server message on a non-ok response (invalid/expired token)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "Invalid or expired token" }),
    });

    render(<ResetPage />);

    await userEvent.type(screen.getByPlaceholderText("At least 8 characters"), "NewPassword1!");
    await userEvent.type(screen.getByPlaceholderText("Repeat new password"), "NewPassword1!");
    await userEvent.click(screen.getByRole("button", { name: /set new password/i }));

    await screen.findByText(/invalid or expired token/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("blocks submit and never calls fetch when the password is too short", async () => {
    render(<ResetPage />);

    await userEvent.type(screen.getByPlaceholderText("At least 8 characters"), "short");
    await userEvent.type(screen.getByPlaceholderText("Repeat new password"), "short");
    await userEvent.click(screen.getByRole("button", { name: /set new password/i }));

    await screen.findByText(/at least 8 characters/i);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
