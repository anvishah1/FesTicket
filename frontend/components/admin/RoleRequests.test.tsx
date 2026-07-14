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

  // --- Search: an admin identifies a request by student name, email, or fest ---
  describe("search", () => {
    const loadTwo = async () => {
      setToken();
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ success: true, data: twoRequests }) }) as unknown as typeof fetch;
      render(<RoleRequests />);
      await screen.findByText("Alice");
    };
    const search = () => screen.getByLabelText(/search role requests/i);

    it("filters by student NAME", async () => {
      await loadTwo();
      await userEvent.type(search(), "bob");
      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("1 of 2 requests")).toBeInTheDocument();
    });

    it("filters by EMAIL", async () => {
      await loadTwo();
      await userEvent.type(search(), "alice@x.com");
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    });

    it("filters by FEST NAME (and keeps both when they share a fest)", async () => {
      await loadTwo();
      await userEvent.type(search(), "techfest");
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("2 of 2 requests")).toBeInTheDocument();
    });

    it("is case-insensitive and matches partial text", async () => {
      await loadTwo();
      await userEvent.type(search(), "AL");
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    });

    it("shows a no-match state that can be cleared", async () => {
      await loadTwo();
      await userEvent.type(search(), "zzzz");
      expect(screen.getByText("No matching requests")).toBeInTheDocument();
      expect(screen.queryByText("Alice")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /clear search/i }));
      expect(await screen.findByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });
  });

  // --- Pending / Approved switcher ---
  describe("tabs", () => {
    // Alice is PENDING, Bob is already APPROVED.
    const mixed = [twoRequests[0], { ...twoRequests[1], status: "APPROVED" }];
    const loadMixed = async () => {
      setToken();
      globalThis.fetch = vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ success: true, data: mixed }) }) as unknown as typeof fetch;
      render(<RoleRequests />);
      await screen.findByText("Alice");
    };

    it("requests ALL statuses (the API returns only pending by default)", async () => {
      await loadMixed();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("status=all"),
        expect.anything()
      );
    });

    it("defaults to Pending and keeps the two lists separate", async () => {
      await loadMixed();
      expect(screen.getByRole("tab", { name: /pending \(1\)/i })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: /approved \(1\)/i })).toHaveAttribute("aria-selected", "false");
      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.queryByText("Bob")).not.toBeInTheDocument(); // approved -> other tab
    });

    it("switches to Approved and shows only approved requests", async () => {
      await loadMixed();
      await userEvent.click(screen.getByRole("tab", { name: /approved/i }));
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
      expect(screen.getByText("1 Approved Request")).toBeInTheDocument();
    });

    it("scopes the search to the ACTIVE tab", async () => {
      await loadMixed();
      // Searching for the APPROVED person while on Pending must not surface them.
      await userEvent.type(screen.getByLabelText(/search role requests/i), "bob");
      expect(screen.getByText("No matching requests")).toBeInTheDocument();
      expect(screen.queryByText("Bob")).not.toBeInTheDocument();

      // The same query on the Approved tab does find them.
      await userEvent.click(screen.getByRole("tab", { name: /approved/i }));
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });
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

  it("approves a request with a PATCH and MOVES the row from Pending to Approved", async () => {
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

    // It LEAVES the Pending tab (which is the one we're on) …
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /pending \(0\)/i })).toBeInTheDocument()
    );
    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.getByText("No pending requests")).toBeInTheDocument();

    // … and shows up under Approved, with no approve/deny actions.
    await userEvent.click(screen.getByRole("tab", { name: /approved \(1\)/i }));
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getAllByText("APPROVED").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
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
