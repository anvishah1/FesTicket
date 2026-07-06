import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MarketingPage from "@/app/host/marketing/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));

const resp = (body: unknown, ok = true) =>
  Promise.resolve({ ok, status: ok ? 200 : 500, json: async () => body }) as unknown as Promise<Response>;

function installFetch() {
  globalThis.fetch = vi.fn((url: unknown) => {
    const u = String(url);
    // This host owns no rows of its own...
    if (u.includes("/api/events/marketing/host/3/sponsors")) return resp({ success: true, data: [] });
    if (u.includes("/api/events/marketing/host/3/expenses")) return resp({ success: true, data: [] });
    // ...but the fest-wide totals are non-zero (another editor's data).
    if (u.includes("/api/events/marketing/fest/7/sponsors"))
      return resp({ success: true, data: [{ receivedAmount: 10000, sponsorshipAmount: 20000 }] });
    if (u.includes("/api/events/marketing/fest/7/expenses"))
      return resp({ success: true, data: [{ amount: 3000 }] });
    return resp({ success: true, data: [] });
  }) as unknown as typeof fetch;
}

describe("MarketingPage — Net Balance", () => {
  beforeEach(() => {
    window.localStorage.setItem(
      "auth_user",
      JSON.stringify({ id: 3, email: "h@x.edu", role: "HOST", profileCompleted: true, editorFestId: 7 })
    );
    window.localStorage.setItem("auth_accessToken", "tok");
    installFetch();
  });

  it("computes the Net Balance from fest-wide income and spend, not the host's own rows", async () => {
    render(<MarketingPage />);
    // Received (fest-wide) = 10000, Expenses (fest-wide) = 3000.
    expect(await screen.findByText("₹10,000.00")).toBeInTheDocument();
    expect(await screen.findByText("₹3,000.00")).toBeInTheDocument();
    // Net = 10000 - 3000 = +₹7,000 (would be ₹0 if it used this host's empty rows).
    expect(await screen.findByText("+₹7,000.00")).toBeInTheDocument();
  });

  it("associates every sponsor-form field with a label (WCAG 1.3.1)", async () => {
    render(<MarketingPage />);
    await screen.findByText("+₹7,000.00");
    await userEvent.click(screen.getByRole("button", { name: /add sponsor/i }));
    const dialog = await screen.findByRole("dialog", { name: /add sponsor/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText("Company Name *")).toBeInTheDocument();
    expect(screen.getByLabelText("Contact Person *")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Sponsorship Amount (₹) *")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount Received (₹)")).toBeInTheDocument();
    expect(screen.getByLabelText("Status *")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    // File input carries an accessible name.
    expect(
      screen.getByLabelText(/upload agreement document/i)
    ).toBeInTheDocument();
    // Close control is named.
    expect(
      screen.getByRole("button", { name: /close dialog/i })
    ).toBeInTheDocument();
  });

  it("associates every expense-form field with a label and names the file inputs", async () => {
    render(<MarketingPage />);
    await screen.findByText("+₹7,000.00");
    // Switch to the Expenses tab, then open its form.
    await userEvent.click(screen.getByRole("button", { name: /^expenses \(/i }));
    await userEvent.click(screen.getByRole("button", { name: /add expense/i }));
    await screen.findByRole("dialog", { name: /add expense/i });
    expect(screen.getByLabelText("Description *")).toBeInTheDocument();
    expect(screen.getByLabelText("Category *")).toBeInTheDocument();
    expect(screen.getByLabelText("Vendor *")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount (₹) *")).toBeInTheDocument();
    expect(screen.getByLabelText("Payment Date *")).toBeInTheDocument();
    expect(screen.getByLabelText("Payment Method *")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    expect(screen.getByLabelText(/upload payment proof/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/upload bill or invoice/i)).toBeInTheDocument();
  });
});
