import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// email.js now imports the Prisma singleton to write EmailLog rows — mock it so
// the unit test never touches a real database.
vi.mock("@prisma/client");
import { resetPrismaMock } from "@prisma/client";

// Mock nodemailer's default export. Use vi.hoisted so the mocks are constructed
// before the (hoisted) vi.mock factory and before email.js is imported.
const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn(async () => ({ messageId: "msg_1" }));
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { sendMailMock, createTransportMock };
});

vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportMock },
}));

import { sendMail, sendBookingConfirmation, htmlToText, renderEmail } from "../../src/utils/email.js";

beforeEach(() => {
  resetPrismaMock();
  sendMailMock.mockClear();
  createTransportMock.mockClear();
  sendMailMock.mockResolvedValue({ messageId: "msg_1" });
  delete process.env.EMAIL_PROVIDER;
});

// Helper to enable/disable a working SMTP config for a test.
function setSmtpConfigured() {
  process.env.SMTP_HOST = "smtp.example.com";
  process.env.SMTP_PORT = "587";
  process.env.SMTP_USER = "smtp-user";
  process.env.SMTP_PASS = "smtp-pass";
}
function clearSmtp() {
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
}

afterEach(clearSmtp);

describe("sendMail", () => {
  it("returns { sent:false, reason:'not_configured' } when SMTP env is unset", async () => {
    clearSmtp();
    const result = await sendMail({ to: "x@y.com", subject: "Hi", html: "<b>Hi</b>" });
    expect(result).toEqual({ sent: false, reason: "not_configured" });
    expect(createTransportMock).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("returns { sent:true } and calls transport.sendMail when SMTP is configured", async () => {
    setSmtpConfigured();
    const result = await sendMail({
      to: "buyer@example.com",
      subject: "Receipt",
      html: "<p>Thanks</p>",
    });
    expect(result).toEqual({ sent: true });
    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const arg = sendMailMock.mock.calls[0][0];
    expect(arg.to).toBe("buyer@example.com");
    expect(arg.subject).toBe("Receipt");
    expect(arg.html).toBe("<p>Thanks</p>");
    expect(arg.from).toBeTruthy();
  });

  it("derives a text body by stripping HTML tags when no text is given", async () => {
    setSmtpConfigured();
    await sendMail({ to: "x@y.com", subject: "S", html: "<b>Hello</b> world" });
    const arg = sendMailMock.mock.calls[0][0];
    expect(arg.text).toBe("Hello world");
  });

  it("returns { sent:false, error } when transport.sendMail throws", async () => {
    setSmtpConfigured();
    sendMailMock.mockRejectedValueOnce(new Error("smtp exploded"));
    const result = await sendMail({ to: "x@y.com", subject: "S", html: "<b>hi</b>" });
    expect(result.sent).toBe(false);
    expect(result.error).toBe("smtp exploded");
  });
});

describe("sendBookingConfirmation", () => {
  const baseBooking = {
    bookingCode: "TIQR-ABC123",
    guestName: "Guest User",
    event: {
      name: "Spring Fest Night",
      startDate: "2026-03-01T00:00:00.000Z",
      startTime: "18:00",
      venue: "Main Auditorium",
    },
    items: [
      { ticketType: { name: "VIP" }, quantity: 2, unitPrice: 500, totalPrice: 1000 },
    ],
    subtotal: 1000,
    platformFee: 20,
    tax: 180,
    total: 1200,
  };

  it("returns { sent:false, reason:'no_email' } when neither guestEmail nor user.email exists", async () => {
    setSmtpConfigured();
    const result = await sendBookingConfirmation({ ...baseBooking });
    expect(result).toEqual({ sent: false, reason: "no_email" });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("builds and sends an HTML receipt to guestEmail with the bookingCode in the subject", async () => {
    setSmtpConfigured();
    const result = await sendBookingConfirmation({
      ...baseBooking,
      guestEmail: "guest@example.com",
    });
    expect(result).toEqual({ sent: true });
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const arg = sendMailMock.mock.calls[0][0];
    expect(arg.to).toBe("guest@example.com");
    expect(arg.subject).toContain("TIQR-ABC123");
    expect(arg.subject).toContain("Spring Fest Night");
    expect(arg.html).toContain("TIQR-ABC123");
    expect(arg.html).toContain("Spring Fest Night");
    expect(arg.html).toContain("VIP");
    expect(arg.html).toContain("Guest User");
  });

  it("HTML-escapes user/organizer-controlled fields to prevent markup injection", async () => {
    setSmtpConfigured();
    const result = await sendBookingConfirmation({
      ...baseBooking,
      guestEmail: "guest@example.com",
      guestName: '<script>alert(1)</script>',
      event: {
        ...baseBooking.event,
        name: "Fest <b>Bold</b>",
        venue: '<img src=x onerror="alert(2)">',
      },
      items: [
        { ticketType: { name: "VIP <script>evil()</script>" }, quantity: 1, unitPrice: 100, totalPrice: 100 },
      ],
    });

    expect(result).toEqual({ sent: true });
    const html = sendMailMock.mock.calls[0][0].html;

    // Raw injected markup must NOT appear verbatim in the HTML body.
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<b>Bold</b>");
    expect(html).not.toContain('<img src=x onerror="alert(2)">');
    expect(html).not.toContain("<script>evil()</script>");

    // Escaped entities must be present instead.
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Fest &lt;b&gt;Bold&lt;/b&gt;");
    expect(html).toContain("VIP &lt;script&gt;evil()&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(2)&quot;&gt;");
  });

  it("falls back to user.email when guestEmail is absent", async () => {
    setSmtpConfigured();
    const result = await sendBookingConfirmation({
      ...baseBooking,
      user: { email: "member@example.com", name: "Member" },
    });
    expect(result).toEqual({ sent: true });
    expect(sendMailMock.mock.calls[0][0].to).toBe("member@example.com");
  });

  it("propagates the not_configured result from sendMail when SMTP is unset", async () => {
    clearSmtp();
    const result = await sendBookingConfirmation({
      ...baseBooking,
      guestEmail: "guest@example.com",
    });
    expect(result).toEqual({ sent: false, reason: "not_configured" });
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe("renderEmail / htmlToText (NOTIF-01)", () => {
  it("htmlToText converts block boundaries to newlines and strips inline tags", () => {
    expect(htmlToText("<p>Hello</p><p>World</p>")).toBe("Hello\nWorld");
    expect(htmlToText("Line1<br>Line2")).toBe("Line1\nLine2");
    expect(htmlToText("<b>Bold</b> text")).toBe("Bold text");
  });

  it("htmlToText decodes common HTML entities", () => {
    expect(htmlToText("A &amp; B &lt;x&gt;")).toBe("A & B <x>");
  });

  it("renderEmail returns a table layout + plaintext, with the CTA as 'label (url)'", () => {
    const { html, text } = renderEmail({
      preheader: "pre",
      heading: "Hi",
      bodyHtml: "<tr><td>Body</td></tr>",
      cta: { label: "Pay now", url: "https://x.test/pay" },
      footerNote: "foot",
    });
    expect(html).toContain('role="presentation"');
    expect(html).toContain("Body");
    expect(html).toContain("https://x.test/pay");
    expect(text).toContain("Body");
    expect(text).toContain("Pay now (https://x.test/pay)");
  });
});
