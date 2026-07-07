import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationSettingsPage from "./page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
const showToast = vi.fn();
vi.mock("@/lib/toast", () => ({ showToast: (...a: unknown[]) => showToast(...a) }));
const apiFetch = vi.fn();
vi.mock("@/lib/auth", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  isAuthenticated: () => true,
}));

const prefs = { notifyReminders: true, notifySalesAlerts: true, notifySalesDigest: false, notifyMarketing: true };

beforeEach(() => {
  apiFetch.mockReset();
  showToast.mockReset();
});

describe("NotificationSettingsPage (NOTIF-09)", () => {
  it("loads current flags and reflects them in the checkboxes", async () => {
    apiFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: prefs }) });
    render(<NotificationSettingsPage />);
    await waitFor(() => expect(screen.getByTestId("pref-notifyReminders")).toBeChecked());
    expect(screen.getByTestId("pref-notifySalesDigest")).not.toBeChecked();
  });

  it("toggles a flag and PUTs the updated prefs on save", async () => {
    apiFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: prefs }) }) // load
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: {} }) }); // save
    render(<NotificationSettingsPage />);
    await waitFor(() => expect(screen.getByTestId("pref-notifyReminders")).toBeChecked());

    await userEvent.click(screen.getByTestId("pref-notifyReminders")); // -> false
    await userEvent.click(screen.getByRole("button", { name: /save preferences/i }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/notifications/preferences",
        expect.objectContaining({ method: "PUT", body: expect.stringContaining('"notifyReminders":false') })
      )
    );
    await waitFor(() => expect(showToast).toHaveBeenCalledWith("Notification preferences saved", "success"));
  });
});
