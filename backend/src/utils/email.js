// backend/src/utils/email.js
import nodemailer from "nodemailer";

const MAIL_FROM = process.env.MAIL_FROM || process.env.SMTP_USER || "noreply@tiqr.events";
const APP_NAME = process.env.APP_NAME || "tiqr";

/**
 * Escape a string for safe interpolation into HTML. User/organizer-controlled
 * values (event name/venue/date strings, buyer name, ticket item names) must be
 * escaped so a value like `<script>` cannot inject markup into the receipt email.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
  });
}

export async function sendMail({ to, subject, html, text }) {
  const transport = getTransport();
  if (!transport) {
    console.warn("[email] SMTP not configured (SMTP_HOST/USER/PASS). Skipping send.");
    return { sent: false, reason: "not_configured" };
  }
  try {
    await transport.sendMail({
      from: MAIL_FROM,
      to,
      subject,
      html: html || text,
      text: text || (html ? html.replace(/<[^>]+>/g, "").trim() : undefined),
    });
    console.log("[email] Sent successfully to", to);
    return { sent: true };
  } catch (err) {
    const msg = err.response?.body || err.response || err.message || String(err);
    console.error("[email] Send failed:", msg);
    return { sent: false, error: msg };
  }
}

/**
 * Send booking confirmation (receipt) to the customer.
 * @param {object} booking - Prisma booking with include: { event, items: { include: { ticketType } }, user? }
 */
export async function sendBookingConfirmation(booking) {
  const to = booking.guestEmail || booking.user?.email;
  if (!to) {
    console.warn("[email] No email for booking", booking.bookingCode, "- cannot send confirmation.");
    return { sent: false, reason: "no_email" };
  }
  console.log("[email] Sending booking confirmation to", to, "for", booking.bookingCode);

  const event = booking.event || {};
  const eventName = event.name || "Event";
  const eventDate = event.startDate
    ? new Date(event.startDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : "—";
  const eventTime = event.startTime || "—";
  const venue = event.venue || "—";

  const rows = (booking.items || []).map((item) => {
    const name = item.ticketType?.name || "Ticket";
    const qty = item.quantity || 0;
    const unit = item.unitPrice ?? 0;
    const total = item.totalPrice ?? 0;
    return { name, qty, unit, total };
  });

  const subtotal = booking.subtotal ?? 0;
  const platformFee = booking.platformFee ?? 0;
  const tax = booking.tax ?? 0;
  const total = booking.total ?? 0;
  const buyerName = booking.guestName || booking.user?.name || "Guest";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Booking Confirmed</title>
</head>
<body style="margin:0; font-family: system-ui, -apple-system, sans-serif; background:#f5f5f5; padding:24px;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <div style="background:#522C5D; color:#fff; padding:24px; text-align:center;">
      <h1 style="margin:0; font-size:24px;">${APP_NAME}</h1>
      <p style="margin:8px 0 0; opacity:0.9;">Booking Confirmed</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px; font-size:16px; color:#333;">Hi ${escapeHtml(buyerName)},</p>
      <p style="margin:0 0 24px; color:#555;">Your booking is confirmed. Keep this email as your receipt.</p>

      <p style="margin:0 0 8px; font-weight:600; color:#333;">Booking ID</p>
      <p style="margin:0 0 20px; font-family:monospace; font-size:18px; color:#522C5D;">${booking.bookingCode}</p>

      <div style="border:1px solid #eee; border-radius:8px; padding:16px; margin-bottom:20px; background:#fafafa;">
        <p style="margin:0 0 8px; font-weight:600; color:#333;">${escapeHtml(eventName)}</p>
        <p style="margin:0; font-size:14px; color:#666;">${escapeHtml(eventDate)} · ${escapeHtml(eventTime)}</p>
        <p style="margin:4px 0 0; font-size:14px; color:#666;">${escapeHtml(venue)}</p>
      </div>

      <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
        <thead>
          <tr style="border-bottom:2px solid #eee;">
            <th style="text-align:left; padding:10px 8px; font-size:12px; color:#666; text-transform:uppercase;">Ticket</th>
            <th style="text-align:center; padding:10px 8px; font-size:12px; color:#666; text-transform:uppercase;">Qty</th>
            <th style="text-align:right; padding:10px 8px; font-size:12px; color:#666; text-transform:uppercase;">Unit</th>
            <th style="text-align:right; padding:10px 8px; font-size:12px; color:#666; text-transform:uppercase;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
          <tr style="border-bottom:1px solid #f0f0f0;">
            <td style="padding:10px 8px;">${escapeHtml(r.name)}</td>
            <td style="text-align:center; padding:10px 8px;">${r.qty}</td>
            <td style="text-align:right; padding:10px 8px;">₹${Number(r.unit).toLocaleString("en-IN")}</td>
            <td style="text-align:right; padding:10px 8px;">₹${Number(r.total).toLocaleString("en-IN")}</td>
          </tr>`).join("")}
        </tbody>
      </table>

      <table style="width:100%; border-collapse:collapse;">
        <tr style="border-bottom:1px solid #eee;"><td style="padding:8px 0;">Subtotal</td><td style="text-align:right; padding:8px 0;">₹${Number(subtotal).toLocaleString("en-IN")}</td></tr>
        ${platformFee > 0 ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:8px 0;">Platform fee</td><td style="text-align:right; padding:8px 0;">₹${Number(platformFee).toLocaleString("en-IN")}</td></tr>` : ""}
        ${tax > 0 ? `<tr style="border-bottom:1px solid #eee;"><td style="padding:8px 0;">Tax</td><td style="text-align:right; padding:8px 0;">₹${Number(tax).toLocaleString("en-IN")}</td></tr>` : ""}
        <tr><td style="padding:12px 0 0; font-weight:700;">Total paid</td><td style="text-align:right; padding:12px 0 0; font-weight:700;">₹${Number(total).toLocaleString("en-IN")}</td></tr>
      </table>

      <p style="margin:24px 0 0; font-size:13px; color:#888;">Thank you for booking with ${APP_NAME}.</p>
    </div>
  </div>
</body>
</html>`;

  return sendMail({
    to,
    subject: `Booking confirmed – ${eventName} (${booking.bookingCode})`,
    html,
  });
}
