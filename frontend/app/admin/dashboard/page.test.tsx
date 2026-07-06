import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminDashboardPage from "@/app/admin/dashboard/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
vi.mock("@/components/admin/RoleRequests", () => ({ default: () => <div>role-requests</div> }));
vi.mock("@/components/admin/FestEvents", () => ({ default: () => <div>fest-events</div> }));
vi.mock("@/components/admin/Companies", () => ({ default: () => <div>companies</div> }));
vi.mock("@/components/admin/Expenses", () => ({ default: () => <div>expenses</div> }));
vi.mock("@/components/admin/CreateFest", () => ({ default: () => <div>create-fest</div> }));

const resp = (body: unknown, ok = true) =>
  Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Promise<Response>;

function installFetch() {
  globalThis.fetch = vi.fn((url: unknown) => {
    const u = String(url);
    if (u.includes("/api/user/me"))
      return resp({ managedFestId: 7, editorFestId: null, managedFest: { adminKey: "TIQR-KEY" } });
    if (u.includes("/api/events/analytics/fest/7"))
      return resp({ success: true, data: { revenue: 5000, ticketsSold: 12, eventsCount: 3, bookingsCount: 4 } });
    if (u.includes("/api/events/marketing/fest/7/expenses"))
      return resp({ success: true, data: [{ amount: 2000 }] });
    if (u.includes("/api/fests/7/key"))
      return resp({ success: true, data: { adminKey: "TIQR-KEY" } });
    if (u.includes("/api/fests/7"))
      return resp({ success: true, data: { name: "TechFest" } });
    return resp({ success: true, data: [] });
  }) as unknown as typeof fetch;
}

describe("AdminDashboardPage", () => {
  beforeEach(() => {
    window.localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 1, email: "a@x.edu", role: "ADMIN", profileCompleted: true, managedFestId: 7 })
    );
    window.localStorage.setItem("auth_accessToken", "tok");
    installFetch();
  });

  it("shows the fest key and financial overview (income + net)", async () => {
    render(<AdminDashboardPage />);
    // Fest key from /api/user/me is displayed for sharing.
    expect(await screen.findByText("TIQR-KEY")).toBeInTheDocument();
    // Income from analytics.
    expect(await screen.findByText("₹5,000")).toBeInTheDocument();
    // Spend from fest expenses.
    expect(await screen.findByText("₹2,000")).toBeInTheDocument();
    // Net = income - spend = 3000.
    expect(await screen.findByText("+₹3,000")).toBeInTheDocument();
  });

  it("copies the fest key to the clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<AdminDashboardPage />);
    await screen.findByText("TIQR-KEY");
    await userEvent.click(screen.getByRole("button", { name: /copy key/i }));
    expect(writeText).toHaveBeenCalledWith("TIQR-KEY");
  });
});
