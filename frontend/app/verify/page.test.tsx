import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import VerifyPage from "./page";

vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
vi.mock("@/lib/auth", () => ({ getApiUrl: () => "http://localhost:4000" }));

let search = new URLSearchParams("");
vi.mock("next/navigation", () => ({ useSearchParams: () => search }));

beforeEach(() => {
  search = new URLSearchParams("");
  globalThis.fetch = vi.fn();
});

describe("VerifyPage (AUTH-01)", () => {
  it("shows success when the token verifies", async () => {
    search = new URLSearchParams("token=good");
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, message: "Email verified successfully" }),
    });
    render(<VerifyPage />);
    expect(await screen.findByText("Email verified ✓")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to sign in/i })).toHaveAttribute("href", "/signin");
  });

  it("shows an error + resend form on an invalid token, and resends", async () => {
    search = new URLSearchParams("token=bad");
    (globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, json: async () => ({ success: false, error: { message: "invalid or has expired" } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    render(<VerifyPage />);
    expect(await screen.findByText("Verification failed")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Email"), "u@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Resend link" }));

    await waitFor(() =>
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1][0]).toContain("/api/auth/resend-verification")
    );
    expect(await screen.findByText(/a new link is on its way/i)).toBeInTheDocument();
  });

  it("shows the resend form with no token", async () => {
    render(<VerifyPage />);
    expect(await screen.findByText("Verify your email")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    // No verify call is made without a token.
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
