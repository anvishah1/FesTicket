import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AccountPage from "./page";

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
const updateStoredUser = vi.fn();
vi.mock("@/lib/auth", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  getStoredUser: () => ({ id: 1, email: "a@b.com", role: "VIEWER" }),
  updateStoredUser: (...a: unknown[]) => updateStoredUser(...a),
  clearAuth: () => clearAuth(),
  isAuthenticated: () => true,
  getApiUrl: () => "http://localhost:4000",
}));

const meResponse = () => ({
  ok: true,
  json: async () => ({
    success: true,
    data: { id: 1, email: "a@b.com", name: "Alice", phone: "111", organizationName: "Org", role: "VIEWER" },
  }),
});

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  showToast.mockReset();
  apiFetch.mockReset();
  clearAuth.mockReset();
  updateStoredUser.mockReset();
});

describe("AccountPage (AUTH-04)", () => {
  it("loads the profile and saves changes via PATCH", async () => {
    apiFetch
      .mockResolvedValueOnce(meResponse())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: { name: "Alice B" } }) });

    render(<AccountPage />);
    const nameInput = (await screen.findByLabelText("Name")) as HTMLInputElement;
    expect(nameInput.value).toBe("Alice");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Alice B");
    await userEvent.click(screen.getByRole("button", { name: /save profile/i }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/user/me", expect.objectContaining({ method: "PATCH" }))
    );
    expect(showToast).toHaveBeenCalledWith("Profile updated", "success");
  });

  it("changes the password then clears auth and redirects to signin", async () => {
    apiFetch
      .mockResolvedValueOnce(meResponse())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });

    render(<AccountPage />);
    await screen.findByLabelText("Current password");
    await userEvent.type(screen.getByLabelText("Current password"), "OldPassword1!");
    await userEvent.type(screen.getByLabelText("New password"), "NewPassword1!");
    await userEvent.type(screen.getByLabelText("Confirm password"), "NewPassword1!");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/auth/change-password", expect.objectContaining({ method: "POST" }))
    );
    expect(clearAuth).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/signin");
  });

  it("deletes the account after typing the exact email, then redirects home", async () => {
    apiFetch
      .mockResolvedValueOnce(meResponse())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<AccountPage />);
    const confirmInput = await screen.findByLabelText("Confirm email to delete");
    await userEvent.type(confirmInput, "a@b.com");
    await userEvent.click(screen.getByRole("button", { name: /delete my account/i }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith("/api/user/me", expect.objectContaining({ method: "DELETE" }))
    );
    expect(clearAuth).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/");
  });
});
