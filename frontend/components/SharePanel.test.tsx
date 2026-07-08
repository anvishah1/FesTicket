import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const showToast = vi.fn();
vi.mock("@/lib/toast", () => ({ showToast: (...args: unknown[]) => showToast(...args) }));

import SharePanel from "@/components/SharePanel";

function setClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

beforeEach(() => showToast.mockReset());

describe("SharePanel (SEO-09)", () => {
  it("builds a WhatsApp link back to the event with ?ref=bookingCode and no PII", () => {
    render(<SharePanel eventId={5} bookingCode="BC123" eventName="Neon Night" />);
    const href = screen.getByRole("link", { name: /whatsapp/i }).getAttribute("href") || "";
    expect(href).toContain("wa.me");
    const decoded = decodeURIComponent(href);
    expect(decoded).toContain("/events/5?ref=BC123");
    expect(decoded).toContain("Neon Night");
    // Share text carries no PII (no email/phone).
    expect(decoded).not.toMatch(/@/);
  });

  it("copies the share link and toasts success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<SharePanel eventId={5} bookingCode="BC123" eventName="Neon Night" />);

    await userEvent.click(screen.getByTestId("copy-link"));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/events/5?ref=BC123"));
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/copied/i), "success");
  });

  it("toasts an error when the clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    setClipboard(writeText);
    render(<SharePanel eventId={5} bookingCode="BC123" />);

    await userEvent.click(screen.getByTestId("copy-link"));

    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/couldn't/i), "error");
  });
});
