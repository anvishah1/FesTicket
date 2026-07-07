import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrganizerUpgradePage from "./page";

const push = vi.fn();
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
const showToast = vi.fn();
vi.mock("@/lib/toast", () => ({ showToast: (...a: unknown[]) => showToast(...a) }));
const apiFetch = vi.fn();
vi.mock("@/lib/auth", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  isAuthenticated: () => true,
  getApiUrl: () => "http://localhost:4000",
}));

const okJson = (data: unknown) => ({ ok: true, json: async () => ({ success: true, data }) });

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  showToast.mockReset();
  apiFetch.mockReset();
});

describe("OrganizerUpgradePage (AUTH-03)", () => {
  it("renders existing requests with a status badge and disables the form when pending", async () => {
    apiFetch.mockResolvedValueOnce(
      okJson([{ id: 1, festName: "TechFest", requestedRole: "EDITOR", status: "PENDING", requestDate: "2026-01-01T00:00:00Z" }])
    );
    render(<OrganizerUpgradePage />);
    expect(await screen.findByText("TechFest")).toBeInTheDocument();
    expect(screen.getByText("PENDING")).toBeInTheDocument();
    expect(screen.getByLabelText("Fest key")).toBeDisabled();
  });

  it("submits a valid fest key (POST) and reloads the list", async () => {
    apiFetch
      .mockResolvedValueOnce(okJson([]))
      .mockResolvedValueOnce(okJson({ id: 2 }))
      .mockResolvedValueOnce(okJson([{ id: 2, festName: "F", status: "PENDING" }]));
    render(<OrganizerUpgradePage />);
    await screen.findByRole("button", { name: /request access/i });
    await userEvent.type(screen.getByLabelText("Fest key"), "KEY123");
    await userEvent.click(screen.getByRole("button", { name: /request access/i }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/role-requests", expect.objectContaining({ method: "POST" }))
    );
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/pending approval/i), "success");
  });

  it("shows an inline error on an invalid fest key (400 details.festKey)", async () => {
    apiFetch.mockResolvedValueOnce(okJson([])).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        error: { code: "VALIDATION_ERROR", message: "Invalid fest key", details: { festKey: "No fest found for this key." } },
      }),
    });
    render(<OrganizerUpgradePage />);
    await screen.findByRole("button", { name: /request access/i });
    await userEvent.type(screen.getByLabelText("Fest key"), "BAD");
    await userEvent.click(screen.getByRole("button", { name: /request access/i }));

    expect(await screen.findByText("No fest found for this key.")).toBeInTheDocument();
  });
});
