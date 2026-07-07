import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SessionsPage from "./page";

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
const clearAuth = vi.fn();
vi.mock("@/lib/auth", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  clearAuth: () => clearAuth(),
  isAuthenticated: () => true,
  getApiUrl: () => "http://localhost:4000",
}));

const listResponse = () => ({
  ok: true,
  json: async () => ({
    success: true,
    data: [
      { id: 10, userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120", ipAddress: "1.1.1.1", createdAt: "2026-01-01T10:00:00Z", expiresAt: "2026-01-08T10:00:00Z" },
      { id: 11, userAgent: "Mozilla/5.0 (iPhone; iOS) Safari/605", ipAddress: "2.2.2.2", createdAt: "2026-01-02T10:00:00Z", expiresAt: "2026-01-09T10:00:00Z" },
    ],
  }),
});

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  showToast.mockReset();
  apiFetch.mockReset();
  clearAuth.mockReset();
});

describe("SessionsPage (AUTH-02)", () => {
  it("lists sessions with device labels and IPs", async () => {
    apiFetch.mockResolvedValueOnce(listResponse());
    render(<SessionsPage />);
    expect(await screen.findByText("Chrome · Windows")).toBeInTheDocument();
    expect(screen.getByText("Safari · iOS")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(2);
  });

  it("revokes a single session via DELETE :id and removes it", async () => {
    apiFetch
      .mockResolvedValueOnce(listResponse())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    render(<SessionsPage />);
    await screen.findByText("Chrome · Windows");
    await userEvent.click(screen.getAllByRole("button", { name: "Revoke" })[0]);
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/auth/sessions/10", expect.objectContaining({ method: "DELETE" }))
    );
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(1));
  });

  it("signs out everywhere via DELETE collection, then clears auth and redirects", async () => {
    apiFetch
      .mockResolvedValueOnce(listResponse())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SessionsPage />);
    await screen.findByText("Chrome · Windows");
    await userEvent.click(screen.getByRole("button", { name: /sign out everywhere/i }));
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/auth/sessions", expect.objectContaining({ method: "DELETE" }))
    );
    expect(clearAuth).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/signin");
  });
});
