// backend/src/utils/email.js
import nodemailer from "nodemailer";
import prisma from "../prisma.js";
import logger from "./logger.js";

const MAIL_FROM = process.env.MAIL_FROM || process.env.SMTP_USER || "noreply@tiqr.events";
const APP_NAME = process.env.APP_NAME || "tiqr";
const BRAND = "#522C5D";

/**
 * Escape a string for safe interpolation into HTML. User/organizer-controlled
 * values (event name/venue/date strings, buyer name, ticket item names) must be
 * escaped so a value like `<script>` cannot inject markup into the receipt email.
 */
export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ==================== NOTIF-01: shared layout + HTML→text ====================

/**
 * Convert email HTML to a readable plaintext part: decode entities, turn block
 * boundaries (<br>, </p>, </tr>, </div>, </h*>) into newlines, render an optional
 * CTA as "label (url)", strip remaining tags, collapse runs of blank lines.
 */
export function htmlToText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|tr|div|h[1-6]|li)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Build a branded, client-safe email from parts. Returns { html, text }.
 * Table/role=presentation layout with inline styles (Outlook-safe), a hidden
 * preheader, and a prefers-color-scheme:dark block for modern clients. `bodyHtml`
 * is caller-provided and MUST already be escaped where it embeds user values.
 */
export function renderEmail({ preheader = "", heading = "", bodyHtml = "", cta = null, footerNote = "" }) {
  const ctaHtml = cta
    ? `<tr><td style="padding:8px 0 4px;">
         <a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">${escapeHtml(cta.label)}</a>
       </td></tr>`
    : "";
  const footerHtml = footerNote
    ? `<p style="margin:20px 0 0;font-size:12px;color:#8a8a8a;">${footerNote}</p>`
    : `<p style="margin:20px 0 0;font-size:12px;color:#8a8a8a;">Sent by ${escapeHtml(APP_NAME)}.</p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(heading || APP_NAME)}</title>
<style>
  @media (prefers-color-scheme: dark) {
    .tq-body { background:#0f0f12 !important; }
    .tq-card { background:#1c1c22 !important; }
    .tq-text { color:#e8e6ec !important; }
    .tq-muted { color:#a8a2b4 !important; }
  }
</style>
</head>
<body class="tq-body" style="margin:0;padding:24px;background:#f5f5f5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
    <tr><td align="center">
      <table role="presentation" class="tq-card" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;border-collapse:collapse;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td bgcolor="${BRAND}" style="background:${BRAND};color:#ffffff;padding:24px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:#ffffff;">${escapeHtml(APP_NAME)}</div>
          ${heading ? `<div style="margin-top:8px;color:#ffffff;opacity:0.9;">${escapeHtml(heading)}</div>` : ""}
        </td></tr>
        <tr><td class="tq-text" style="padding:24px;color:#333333;font-size:15px;line-height:1.5;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            ${bodyHtml}
            ${ctaHtml}
          </table>
          ${footerHtml}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const textParts = [preheader, heading, htmlToText(bodyHtml)];
  if (cta) textParts.push(`${cta.label} (${cta.url})`);
  if (footerNote) textParts.push(htmlToText(footerNote));
  const text = textParts.filter(Boolean).join("\n\n").trim();

  return { html, text };
}

// ==================== NOTIF-04: provider abstraction + retry ====================

// Build the mail provider selected by EMAIL_PROVIDER (default "smtp"). Returns an
// object { name, send({from,to,subject,html,text}) -> {providerMessageId} } or
// null when the selected provider is not configured (graceful skip-with-warn).
function getMailProvider() {
  const kind = (process.env.EMAIL_PROVIDER || "smtp").toLowerCase();

  if (kind === "resend") {
    const key = process.env.RESEND_API_KEY;
    if (!key) return null;
    return {
      name: "resend",
      async send({ from, to, subject, html, text }) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to, subject, html, text }),
        });
        if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
        const data = await res.json().catch(() => ({}));
        return { providerMessageId: data.id };
      },
    };
  }

  if (kind === "postmark") {
    const token = process.env.POSTMARK_TOKEN;
    if (!token) return null;
    return {
      name: "postmark",
      async send({ from, to, subject, html, text }) {
        const res = await fetch("https://api.postmarkapp.com/email", {
          method: "POST",
          headers: { "X-Postmark-Server-Token": token, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ From: from, To: to, Subject: subject, HtmlBody: html, TextBody: text }),
        });
        if (!res.ok) throw new Error(`Postmark ${res.status}: ${await res.text()}`);
        const data = await res.json().catch(() => ({}));
        return { providerMessageId: data.MessageID };
      },
    };
  }

  if (kind === "ses") {
    // SES over HTTP needs AWS SigV4 signing (out of scope for this pass). Degrade
    // gracefully so a misconfigured EMAIL_PROVIDER never throws at send time.
    logger.warn("[email] EMAIL_PROVIDER=ses is not implemented yet; set EMAIL_PROVIDER to smtp/resend/postmark.");
    return null;
  }

  // Default: SMTP via nodemailer (unchanged config contract).
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return {
    name: "smtp",
    async send({ from, to, subject, html, text }) {
      const transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        auth: { user, pass },
      });
      const info = await transport.sendMail({ from, to, subject, html: html || text, text });
      return { providerMessageId: info?.messageId };
    },
  };
}

// Defensive EmailLog helpers — a logging failure must never break a send.
async function createEmailLog(data) {
  try {
    return await prisma.emailLog.create({ data });
  } catch {
    return null;
  }
}
async function updateEmailLog(log, data) {
  if (!log?.id) return;
  try {
    await prisma.emailLog.update({ where: { id: log.id }, data });
  } catch {
    /* ignore */
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Send an email through the configured provider. Records every attempt in
 * EmailLog and retries transient failures with exponential backoff. Preserves the
 * existing return contract used by callers: { sent:true } on success,
 * { sent:false, reason:"not_configured" } when no provider, { sent:false, error }
 * on final failure.
 * @param {object} opts { to, subject, html, text?, bookingId?, template? }
 */
export async function sendMail({ to, subject, html, text, bookingId, template }) {
  const provider = getMailProvider();
  const textBody = text || (html ? htmlToText(html) : undefined);

  if (!provider) {
    logger.warn("[email] No mail provider configured. Skipping send.");
    await createEmailLog({ toEmail: to, subject, template, bookingId, status: "SKIPPED", lastError: "not_configured" });
    return { sent: false, reason: "not_configured" };
  }

  const log = await createEmailLog({ toEmail: to, subject, template, bookingId, status: "QUEUED", provider: provider.name });

  // No backoff/retry under test so the suite stays fast and deterministic.
  const maxRetries = process.env.NODE_ENV === "test" ? 0 : parseInt(process.env.EMAIL_MAX_RETRIES || "3", 10);

  let attempt = 0;
  let lastErr;
  while (attempt <= maxRetries) {
    attempt += 1;
    try {
      const { providerMessageId } = await provider.send({
        from: MAIL_FROM,
        to,
        subject,
        html: html || textBody,
        text: textBody,
      });
      logger.info({ to }, "[email] Sent successfully");
      await updateEmailLog(log, { status: "SENT", provider: provider.name, providerMessageId, attempts: attempt });
      return { sent: true };
    } catch (err) {
      lastErr = err;
      if (attempt <= maxRetries) await sleep(Math.min(30000, 500 * 2 ** (attempt - 1)));
    }
  }

  const msg = lastErr?.response?.body || lastErr?.response || lastErr?.message || String(lastErr);
  logger.error({ err: lastErr }, "[email] Send failed");
  await updateEmailLog(log, { status: "FAILED", attempts: attempt, lastError: String(msg).slice(0, 1000) });
  return { sent: false, error: msg };
}

/**
 * Send booking confirmation (receipt) to the customer.
 * @param {object} booking - Prisma booking with include: { event, items: { include: { ticketType } }, user? }
 */
export async function sendBookingConfirmation(booking) {
  const to = booking.guestEmail || booking.user?.email;
  if (!to) {
    logger.warn({ bookingCode: booking.bookingCode }, "[email] No email for booking - cannot send confirmation");
    return { sent: false, reason: "no_email" };
  }
  logger.info({ to, bookingCode: booking.bookingCode }, "[email] Sending booking confirmation");

  const event = booking.event || {};
  const eventName = event.name || "Event";
  const eventDate = event.startDate
    ? new Date(event.startDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : "—";
  const eventTime = event.startTime || "—";
  const venue = event.venue || "—";

  const money = (n) => `₹${Number(n ?? 0).toLocaleString("en-IN")}`;
  const rows = (booking.items || []).map((item) => ({
    name: item.ticketType?.name || "Ticket",
    qty: item.quantity || 0,
    unit: item.unitPrice ?? 0,
    total: item.totalPrice ?? 0,
  }));

  const subtotal = booking.subtotal ?? 0;
  const platformFee = booking.platformFee ?? 0;
  const tax = booking.tax ?? 0;
  const total = booking.total ?? 0;
  const buyerName = booking.guestName || booking.user?.name || "Guest";

  const bodyHtml = `
    <tr><td style="padding:0 0 16px;">Hi ${escapeHtml(buyerName)}, your booking is confirmed. Keep this email as your receipt.</td></tr>
    <tr><td style="padding:0 0 4px;font-weight:600;">Booking ID</td></tr>
    <tr><td style="padding:0 0 16px;font-family:monospace;font-size:18px;color:${BRAND};">${escapeHtml(booking.bookingCode)}</td></tr>
    <tr><td style="padding:0 0 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #eeeeee;border-radius:8px;background:#fafafa;">
        <tr><td style="padding:14px 16px;">
          <div style="font-weight:600;">${escapeHtml(eventName)}</div>
          <div style="font-size:14px;color:#666666;">${escapeHtml(eventDate)} · ${escapeHtml(eventTime)}</div>
          <div style="font-size:14px;color:#666666;">${escapeHtml(venue)}</div>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:0 0 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr style="border-bottom:2px solid #eeeeee;">
          <th align="left" style="padding:8px;font-size:12px;color:#666666;text-transform:uppercase;">Ticket</th>
          <th align="center" style="padding:8px;font-size:12px;color:#666666;text-transform:uppercase;">Qty</th>
          <th align="right" style="padding:8px;font-size:12px;color:#666666;text-transform:uppercase;">Unit</th>
          <th align="right" style="padding:8px;font-size:12px;color:#666666;text-transform:uppercase;">Amount</th>
        </tr>
        ${rows.map((r) => `
        <tr style="border-bottom:1px solid #f0f0f0;">
          <td style="padding:10px 8px;">${escapeHtml(r.name)}</td>
          <td align="center" style="padding:10px 8px;">${r.qty}</td>
          <td align="right" style="padding:10px 8px;">${money(r.unit)}</td>
          <td align="right" style="padding:10px 8px;">${money(r.total)}</td>
        </tr>`).join("")}
      </table>
    </td></tr>
    <tr><td style="padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr style="border-bottom:1px solid #eeeeee;"><td style="padding:8px 0;">Subtotal</td><td align="right" style="padding:8px 0;">${money(subtotal)}</td></tr>
        ${platformFee > 0 ? `<tr style="border-bottom:1px solid #eeeeee;"><td style="padding:8px 0;">Platform fee</td><td align="right" style="padding:8px 0;">${money(platformFee)}</td></tr>` : ""}
        ${tax > 0 ? `<tr style="border-bottom:1px solid #eeeeee;"><td style="padding:8px 0;">Tax</td><td align="right" style="padding:8px 0;">${money(tax)}</td></tr>` : ""}
        <tr><td style="padding:12px 0 0;font-weight:700;">Total paid</td><td align="right" style="padding:12px 0 0;font-weight:700;">${money(total)}</td></tr>
      </table>
    </td></tr>`;

  const { html, text } = renderEmail({
    preheader: `Your ${eventName} booking ${booking.bookingCode} is confirmed`,
    heading: "Booking confirmed",
    bodyHtml,
    footerNote: `Thank you for booking with ${escapeHtml(APP_NAME)}.`,
  });

  return sendMail({
    to,
    subject: `Booking confirmed – ${eventName} (${booking.bookingCode})`,
    html,
    text,
    bookingId: booking.id,
    template: "booking_confirmation",
  });
}
