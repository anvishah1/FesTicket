import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RoleRequests from "@/components/admin/RoleRequests";

const twoRequests = [
  {
    id: 1,
    userId: 100,
    festId: 7,
    festName: "TechFest",
    studentName: "Alice",
    email: "alice@x.com",
    organization: null,
    requestedRole: "EDITOR",
    requestDate: "2026-06-01T00:00:00Z",
    status: "PENDING",
  },
  {
    id: 2,
    userId: 101,
    festId: 7,
    festName: "TechFest",
    studentName: "Bob",
    email: "bob@x.com",
    organization: "ClubX",
    requestedRole: "HOST",
    requestDate: "2026-06-02T00:00:00Z",
    status: "PENDING",
  },
];

const oneRequest = [twoRequests[0]];

function setToken() {
  localStorage.setItem("auth_accessToken", "tok123");
}

describe("RoleRequests", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  it("renders the empty 'all caught up' state when there is no token", async () => {
    render(<RoleRequests />);
    expect(await screen.findByText("All caught up!")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the loading state while the request is in flight", () => {
    setToken();
    globalThis.fetch = vi
      .fn()
      .mockReturnValue(new Promise(() => {})) as unknown as typeof fetch;
    render(<RoleRequests />);
    expect(screen.getByText("Loading role requests...")).toBeInTheDocument();
  });

  it("loads role requests with the auth header and renders the list", async () => {
    setToken();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true, data: twoRequests }) }) as unknown as typeof fetch;
    render(<RoleRequests />);
    await screen.findByText("Alice");
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("alice@x.com")).toBeInTheDocument();
    expect(screen.getByText("2 Pending Requests")).toBeInTheDocument();

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/role-requests"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer tok123" }),
      })
    );
  });

  it("renders the error state when the list request fails", async () => {
    setToken();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
    render(<RoleRequests />);
    expect(
      await screen.findByText("Could not load role requests.")
    ).toBeInTheDocument();
  });

  it("treats a non-array payload as no requests", async () => {
    setToken();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { oops: true } }) }) as unknown as typeof fetch;
    render(<RoleRequests />);
    expect(await screen.findByText("All caught up!")).toBeInTheDocument();
  });

  it("approves a request with a PATCH and swaps the row to APPROVED", async () => {
    setToken();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: oneRequest }) })
      .mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
    render(<RoleRequests />);
    await screen.findByText("Alice");

    await userEvent.click(screen.getByRole("button", { name: /approve/i }));

    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining("/api/role-requests/1"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "APPROVED" }),
        headers: expect.objectContaining({ Authorization: "Bearer tok123" }),
      })
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /approve/i })
      ).not.toBeInTheDocument()
    );
    expect(screen.getAllByText("APPROVED").length).toBeGreaterThan(0);
  });

  it("denies a request with a PATCH and removes it from the list", async () => {
    setToken();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: oneRequest }) })
      .mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
    render(<RoleRequests />);
    await screen.findByText("Alice");

    await userEvent.click(screen.getByRole("button", { name: /deny/i }));

    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining("/api/role-requests/1"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ status: "DENIED" }),
      })
    );

    // removing the only request drops back to the empty state
    expect(await screen.findByText("All caught up!")).toBeInTheDocument();
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
  });

  it("surfaces an error when the approve request fails", async () => {
    setToken();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: oneRequest }) })
      .mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
    render(<RoleRequests />);
    await screen.findByText("Alice");

    await userEvent.click(screen.getByRole("button", { name: /approve/i }));

    expect(await screen.findByText("Failed to approve.")).toBeInTheDocument();
  });
});
