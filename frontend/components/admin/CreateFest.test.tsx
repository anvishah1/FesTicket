import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateFest from "@/components/admin/CreateFest";

describe("CreateFest", () => {
  beforeEach(() => {
    // A fresh spy so we can assert the honest state never hits the API.
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  it("renders the create-fest panel heading", () => {
    render(<CreateFest />);
    expect(screen.getByText("Create New Fest")).toBeInTheDocument();
  });

  it("explains that fest creation is CLI-driven (admin onboarding), not in-app", () => {
    render(<CreateFest />);
    expect(
      screen.getByText(/isn't available in the dashboard/i)
    ).toBeInTheDocument();
    // References the supported onboarding script so the guidance is actionable.
    expect(screen.getByText(/approveAdminRequest\.js/)).toBeInTheDocument();
  });

  it("disables the Create Fest control so no orphaned fest can be created", () => {
    render(<CreateFest />);
    expect(
      screen.getByRole("button", { name: "Create Fest" })
    ).toBeDisabled();
  });

  it("does not call the API (the broken in-app create flow is removed)", async () => {
    render(<CreateFest />);
    // Disabled button ignores the click; no request is ever made.
    await userEvent.click(
      screen.getByRole("button", { name: "Create Fest" })
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
