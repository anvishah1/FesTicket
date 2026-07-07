import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotificationBell from "@/components/NotificationBell";

vi.mock("next/link", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ children, href, ...rest }: any) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const apiFetch = vi.fn();
vi.mock("@/lib/auth", () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }));

const listBody = (notifications: unknown[], unreadCount: number) => ({
  ok: true,
  json: async () => ({ success: true, data: { notifications, unreadCount, nextCursor: null } }),
});

beforeEach(() => {
  apiFetch.mockReset();
});

describe("NotificationBell (NOTIF-08)", () => {
  it("shows an unread badge from the fetched count", async () => {
    apiFetch.mockResolvedValueOnce(
      listBody([{ id: 1, type: "new_sale", title: "New sale", read: false, createdAt: "2026-01-01" }], 1)
    );
    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByTestId("notification-badge")).toHaveTextContent("1"));
  });

  it("opens the dropdown and lists notifications", async () => {
    apiFetch.mockResolvedValueOnce(
      listBody(
        [
          { id: 1, type: "new_sale", title: "New sale", body: "A ticket sold", read: false, createdAt: "2026-01-01", linkUrl: "/host/dashboard" },
        ],
        1
      )
    );
    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByTestId("notification-badge")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId("notification-bell"));
    expect(screen.getByTestId("notification-dropdown")).toBeInTheDocument();
    expect(screen.getByText("New sale")).toBeInTheDocument();
    expect(screen.getByTestId("notification-item")).toHaveAttribute("href", "/host/dashboard");
  });

  it("marks all read via PATCH and clears the badge", async () => {
    apiFetch
      .mockResolvedValueOnce(listBody([{ id: 1, type: "x", title: "One", read: false, createdAt: "2026-01-01" }], 1))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) }); // read-all
    render(<NotificationBell />);
    await waitFor(() => expect(screen.getByTestId("notification-badge")).toBeInTheDocument());
    await userEvent.click(screen.getByTestId("notification-bell"));
    await userEvent.click(screen.getByRole("button", { name: /mark all read/i }));

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        "/api/notifications/read-all",
        { method: "PATCH" },
        expect.anything()
      )
    );
    expect(screen.queryByTestId("notification-badge")).not.toBeInTheDocument();
  });

  it("renders no badge when there are zero unread", async () => {
    apiFetch.mockResolvedValueOnce(listBody([], 0));
    render(<NotificationBell />);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(screen.queryByTestId("notification-badge")).not.toBeInTheDocument();
  });
});
