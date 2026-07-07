// backend/src/utils/email.js
import nodemailer from "nodemailer";
import QRCode from "qrcode";
import prisma from "../prisma.js";
import logger from "./logger.js";
import { walletAvailability } from "./wallet.js";
import { signUnsubscribeToken } from "./notifications.js";
import { buildEventIcs } from "./ics.js";

// NOTIF-09: build the RFC-8058 List-Unsubscribe headers + a public unsubscribe
// URL for a NON-transactional email to a registered user. Returns null for a
// guest (no userId) — guests have no per-category prefs. The URL points at the
// API so the one-click GET/POST can flip the flag without a login.
export function unsubscribeFor(userId, category) {
  if (!userId) return null;
  const apiBase = process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4000}`;
  const token = signUnsubscribeToken(userId, category);
  const url = `${apiBase}/api/unsubscribe?token=${encodeURIComponent(token)}`;
  const headers = {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  return { url, headers };
}

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
    async send({ from, to, subject, html, text, attachments, headers }) {
      const transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        auth: { user, pass },
      });
      // TIX-01: forward inline attachments (e.g. the ticket QR with a cid) so the
      // receipt email can render an <img src="cid:..."> pass.
      // NOTIF-09: forward custom headers (e.g. List-Unsubscribe) for deliverability.
      const info = await transport.sendMail({ from, to, subject, html: html || text, text, attachments, headers });
      return { providerMessageId: info?.messageId };
    },
  };
}

// AUTH-01: is a real mail provider configured? Signup uses this to decide whether
// to require email verification (verification is enforced only when we can send).
export function isMailConfigured() {
  return !!getMailProvider();
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
export async function sendMail({ to, subject, html, text, bookingId, template, attachments, headers }) {
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
        attachments,
        headers,
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

  // PAY-03: booking money is INTEGER PAISE — render as 2-decimal rupees.
  const money = (n) =>
    `₹${(Number(n ?? 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  // PAY-07: a link to download the GST invoice PDF. The invoice endpoint lives on
  // the API; PUBLIC_API_URL overrides the localhost default for real deployments.
  const apiBase = process.env.PUBLIC_API_URL || `http://localhost:${process.env.PORT || 4000}`;
  const invoiceUrl = `${apiBase}/api/bookings/${booking.id}/invoice?code=${encodeURIComponent(booking.bookingCode)}`;
  // TIX-09: add-to-calendar link (only when we know the event id).
  const calendarUrl = booking.event?.id ? `${apiBase}/api/events/${booking.event.id}/calendar.ics` : null;

  // TIX-07: wallet links, included ONLY when the wallet is configured (mirrors
  // the graceful-degradation pattern). Google uses the redirect mode so the link
  // works straight from an email client.
  const wallet = walletAvailability();
  const codeParam = encodeURIComponent(booking.bookingCode);
  const applePassUrl = wallet.apple ? `${apiBase}/api/bookings/code/${codeParam}/apple-pass` : null;
  const googlePassUrl = wallet.google ? `${apiBase}/api/bookings/code/${codeParam}/google-pass?redirect=1` : null;

  // TIX-01: attach the booking QR as an inline cid image. Best-effort — the plain
  // bookingCode above stays as the fallback if the client strips inline images or
  // QR generation fails.
  let attachments;
  let qrHtml = "";
  try {
    const qrBuffer = await QRCode.toBuffer(booking.bookingCode, { width: 240, margin: 1 });
    attachments = [{ filename: "ticket-qr.png", content: qrBuffer, cid: "ticket-qr" }];
    qrHtml = `<tr><td style="padding:0 0 16px;text-align:center;"><img src="cid:ticket-qr" alt="Ticket QR for ${escapeHtml(booking.bookingCode)}" width="200" height="200" style="display:block;margin:0 auto;" /></td></tr>`;
  } catch {
    /* QR is best-effort; the text bookingCode remains the fallback */
  }

  const bodyHtml = `
    <tr><td style="padding:0 0 16px;">Hi ${escapeHtml(buyerName)}, your booking is confirmed. Keep this email as your receipt.</td></tr>
    <tr><td style="padding:0 0 4px;font-weight:600;">Booking ID</td></tr>
    <tr><td style="padding:0 0 16px;font-family:monospace;font-size:18px;color:${BRAND};">${escapeHtml(booking.bookingCode)}</td></tr>
    ${qrHtml}
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
    </td></tr>
    <tr><td style="padding:18px 0 0;">
      <a href="${escapeHtml(invoiceUrl)}" style="color:${BRAND};text-decoration:underline;font-weight:600;">Download your GST invoice (PDF)</a>
    </td></tr>
    ${calendarUrl ? `<tr><td style="padding:8px 0 0;">
      <a href="${escapeHtml(calendarUrl)}" style="color:${BRAND};text-decoration:underline;font-weight:600;">Add to calendar</a>
    </td></tr>` : ""}
    ${applePassUrl ? `<tr><td style="padding:8px 0 0;">
      <a href="${escapeHtml(applePassUrl)}" style="color:${BRAND};text-decoration:underline;font-weight:600;">Add to Apple Wallet</a>
    </td></tr>` : ""}
    ${googlePassUrl ? `<tr><td style="padding:8px 0 0;">
      <a href="${escapeHtml(googlePassUrl)}" style="color:${BRAND};text-decoration:underline;font-weight:600;">Save to Google Wallet</a>
    </td></tr>` : ""}`;

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
    attachments,
  });
}

// ==================== AUTH-01: transactional auth emails ====================

// Verify-your-email (branded, with a CTA button). Non-blocking send.
export async function sendVerificationEmail({ to, name, verifyLink }) {
  const { html, text } = renderEmail({
    preheader: "Confirm your email to activate your account",
    heading: "Verify your email",
    bodyHtml: `
    <tr><td style="padding:0 0 16px;">Hi ${escapeHtml(name || "there")}, welcome to ${escapeHtml(APP_NAME)}! Please confirm this is your email to finish setting up your account.</td></tr>
    <tr><td style="padding:0 0 8px;font-size:14px;color:#666666;">If the button doesn't work, paste this link into your browser:</td></tr>
    <tr><td style="padding:0 0 8px;font-size:13px;color:${BRAND};word-break:break-all;">${escapeHtml(verifyLink)}</td></tr>`,
    cta: { label: "Verify email", url: verifyLink },
    footerNote: `If you didn't create a ${escapeHtml(APP_NAME)} account, you can ignore this email.`,
  });
  return sendMail({ to, subject: `Verify your ${APP_NAME} email`, html, text, template: "email_verification" });
}

// Password-reset link (branded, with a CTA button). Non-blocking send.
export async function sendPasswordResetEmail({ to, name, resetLink }) {
  const { html, text } = renderEmail({
    preheader: "Reset your password",
    heading: "Reset your password",
    bodyHtml: `
    <tr><td style="padding:0 0 16px;">Hi ${escapeHtml(name || "there")}, we received a request to reset your ${escapeHtml(APP_NAME)} password. This link expires in 30 minutes.</td></tr>
    <tr><td style="padding:0 0 8px;font-size:14px;color:#666666;">If the button doesn't work, paste this link into your browser:</td></tr>
    <tr><td style="padding:0 0 8px;font-size:13px;color:${BRAND};word-break:break-all;">${escapeHtml(resetLink)}</td></tr>`,
    cta: { label: "Reset password", url: resetLink },
    footerNote: `If you didn't request this, you can safely ignore this email — your password won't change.`,
  });
  return sendMail({ to, subject: `Reset your ${APP_NAME} password`, html, text, template: "password_reset" });
}

// ==================== NOTIF-06: booking lifecycle emails ====================

// PAY-03: money is integer paise. Small shared renderer for these lifecycle mails.
const paiseToRupees = (n) =>
  `₹${(Number(n ?? 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const FRONTEND = () => process.env.FRONTEND_URL || "http://localhost:3000";

// A booking is CANCELLED — via the manual cancel route (NOT the sweep, which
// sends the distinct "expired" mail). Transactional: always sent when an address
// resolves. Includes any refund wording.
export async function sendBookingCancelled(booking) {
  const to = booking.guestEmail || booking.user?.email;
  if (!to) return { sent: false, reason: "no_email" };
  const event = booking.event || {};
  const eventName = event.name || "your event";
  const buyerName = booking.guestName || booking.user?.name || "there";
  const refunded = booking.refundedAmount ?? 0;
  const bodyHtml = `
    <tr><td style="padding:0 0 16px;">Hi ${escapeHtml(buyerName)}, your booking for <strong>${escapeHtml(eventName)}</strong> has been cancelled.</td></tr>
    <tr><td style="padding:0 0 4px;font-weight:600;">Booking ID</td></tr>
    <tr><td style="padding:0 0 16px;font-family:monospace;font-size:18px;color:${BRAND};">${escapeHtml(booking.bookingCode)}</td></tr>
    ${
      refunded > 0
        ? `<tr><td style="padding:0 0 16px;">A refund of <strong>${paiseToRupees(refunded)}</strong> has been initiated to your original payment method and may take a few business days to appear.</td></tr>`
        : `<tr><td style="padding:0 0 16px;">If you were charged, any eligible refund will be processed to your original payment method.</td></tr>`
    }`;
  const { html, text } = renderEmail({
    preheader: `Your ${eventName} booking was cancelled`,
    heading: "Booking cancelled",
    bodyHtml,
    cta: { label: "Discover events", url: `${FRONTEND()}/fests` },
    footerNote: `If you didn't expect this, please contact support.`,
  });
  return sendMail({
    to,
    subject: `Booking cancelled – ${eventName} (${booking.bookingCode})`,
    html,
    text,
    bookingId: booking.id,
    template: "booking_cancelled",
  });
}

// A payment attempt for a PENDING booking failed / was not captured. Transactional.
// Callers gate this on a real FAILED transition so a retrying buyer isn't spammed.
export async function sendPaymentFailed(booking) {
  const to = booking.guestEmail || booking.user?.email;
  if (!to) return { sent: false, reason: "no_email" };
  const event = booking.event || {};
  const eventName = event.name || "your event";
  const buyerName = booking.guestName || booking.user?.name || "there";
  const resumeUrl = event.id
    ? `${FRONTEND()}/events/${event.id}/payment?bookingCode=${encodeURIComponent(booking.bookingCode)}`
    : `${FRONTEND()}/booking-confirmation?bookingCode=${encodeURIComponent(booking.bookingCode)}`;
  const bodyHtml = `
    <tr><td style="padding:0 0 16px;">Hi ${escapeHtml(buyerName)}, we couldn't confirm your payment for <strong>${escapeHtml(eventName)}</strong>. Your tickets are held for a short while — you can try the payment again.</td></tr>
    <tr><td style="padding:0 0 4px;font-weight:600;">Booking ID</td></tr>
    <tr><td style="padding:0 0 16px;font-family:monospace;font-size:18px;color:${BRAND};">${escapeHtml(booking.bookingCode)}</td></tr>
    <tr><td style="padding:0 0 16px;">If money was deducted, it will be auto-refunded by your bank if the order wasn't captured.</td></tr>`;
  const { html, text } = renderEmail({
    preheader: `Payment couldn't be confirmed for ${eventName}`,
    heading: "Payment not completed",
    bodyHtml,
    cta: { label: "Complete your payment", url: resumeUrl },
    footerNote: `Need help? Reply to this email and we'll sort it out.`,
  });
  return sendMail({
    to,
    subject: `Action needed: complete your payment – ${eventName}`,
    html,
    text,
    bookingId: booking.id,
    template: "payment_failed",
  });
}

// A PENDING booking's hold expired and the stale-sweep released it. Transactional;
// fired ONLY from the sweep (the manual route sends "cancelled" instead).
export async function sendBookingExpired(booking) {
  const to = booking.guestEmail || booking.user?.email;
  if (!to) return { sent: false, reason: "no_email" };
  const event = booking.event || {};
  const eventName = event.name || "your event";
  const buyerName = booking.guestName || booking.user?.name || "there";
  const rebookUrl = event.id ? `${FRONTEND()}/events/${event.id}` : `${FRONTEND()}/fests`;
  const bodyHtml = `
    <tr><td style="padding:0 0 16px;">Hi ${escapeHtml(buyerName)}, your reserved tickets for <strong>${escapeHtml(eventName)}</strong> were released because the payment wasn't completed in time.</td></tr>
    <tr><td style="padding:0 0 16px;">Good news — if seats are still available you can book again in a moment.</td></tr>`;
  const { html, text } = renderEmail({
    preheader: `Your ${eventName} reservation expired`,
    heading: "Reservation expired",
    bodyHtml,
    cta: { label: "Book again", url: rebookUrl },
    footerNote: `Tickets are held for 15 minutes while you pay.`,
  });
  return sendMail({
    to,
    subject: `Your reservation expired – ${eventName}`,
    html,
    text,
    bookingId: booking.id,
    template: "booking_expired",
  });
}

// ==================== NOTIF-02: abandoned-checkout recovery ====================

// Recovery nudge for a PENDING booking whose payment stalled. NON-transactional
// (marketing category): the caller must first check isOptedIn for a registered
// buyer; guests have no prefs. Deep-links back to the payment page to resume.
export async function sendAbandonedCheckout(booking) {
  const to = booking.guestEmail || booking.user?.email;
  if (!to) return { sent: false, reason: "no_email" };
  const event = booking.event || {};
  const eventName = event.name || "your event";
  const buyerName = booking.guestName || booking.user?.name || "there";
  const resumeUrl = event.id
    ? `${FRONTEND()}/events/${event.id}/payment?bookingCode=${encodeURIComponent(booking.bookingCode)}`
    : `${FRONTEND()}/booking-confirmation?bookingCode=${encodeURIComponent(booking.bookingCode)}`;

  const money = (n) =>
    `₹${(Number(n ?? 0) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const ticketLines = (booking.items || [])
    .map((i) => `${escapeHtml(i.ticketType?.name || "Ticket")} × ${i.quantity || 0}`)
    .join("<br>");

  // NOTIF-09: recovery is marketing — attach unsubscribe headers + footer link
  // (only for a registered buyer; guests have no userId).
  const unsub = unsubscribeFor(booking.userId, "marketing");
  const bodyHtml = `
    <tr><td style="padding:0 0 16px;">Hi ${escapeHtml(buyerName)}, your tickets for <strong>${escapeHtml(eventName)}</strong> are still held — but only for a few more minutes. Finish your payment to lock them in.</td></tr>
    ${ticketLines ? `<tr><td style="padding:0 0 16px;">${ticketLines}</td></tr>` : ""}
    <tr><td style="padding:0 0 16px;font-weight:600;">Total due: ${money(booking.total)}</td></tr>`;
  const { html, text } = renderEmail({
    preheader: `Your ${eventName} tickets are still held`,
    heading: "Complete your booking",
    bodyHtml,
    cta: { label: "Complete payment", url: resumeUrl },
    footerNote: unsub
      ? `You're getting this because you started a booking. <a href="${escapeHtml(unsub.url)}" style="color:#666;">Unsubscribe</a>.`
      : `You're getting this because you started a booking.`,
  });
  return sendMail({
    to,
    subject: `Finish your booking – ${eventName}`,
    html,
    text,
    bookingId: booking.id,
    template: "abandoned_checkout",
    headers: unsub?.headers,
  });
}

// ==================== NOTIF-03: event reminders (T-24h / T-1h) ====================

// Pre-event nudge for a COMPLETED booking. Embeds a scannable QR (bookingCode),
// attaches a calendar .ics, and links to Google Maps directions. NON-transactional
// (reminders category): the caller (sendEventReminders) checks isOptedIn first.
export async function sendEventReminder(booking, kind) {
  const to = booking.guestEmail || booking.user?.email;
  if (!to) return { sent: false, reason: "no_email" };
  const event = booking.event || {};
  const eventName = event.name || "your event";
  const buyerName = booking.guestName || booking.user?.name || "there";
  const when = kind === "T1" ? "starting in about an hour" : "coming up in 24 hours";

  const eventDate = event.startDate
    ? new Date(event.startDate).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : "—";
  const eventTime = event.startTime || "—";
  const venue = event.venue || "";
  const destination = event.venueAddress || event.venue || "";
  const directionsUrl = destination
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
    : null;

  // Inline QR (cid) + calendar attachment. Both best-effort.
  const attachments = [];
  let qrHtml = "";
  try {
    const qrBuffer = await QRCode.toBuffer(booking.bookingCode, { width: 240, margin: 1 });
    attachments.push({ filename: "ticket-qr.png", content: qrBuffer, cid: "reminder-qr" });
    qrHtml = `<tr><td style="padding:0 0 16px;text-align:center;"><img src="cid:reminder-qr" alt="Ticket QR" width="180" height="180" style="display:block;margin:0 auto;" /></td></tr>`;
  } catch {
    /* QR is best-effort — the code text below remains the fallback */
  }
  try {
    const ics = buildEventIcs(event);
    if (ics) attachments.push({ filename: "event.ics", content: ics, contentType: "text/calendar; charset=utf-8" });
  } catch {
    /* calendar attachment is best-effort */
  }

  const unsub = unsubscribeFor(booking.userId, "reminders");
  const bodyHtml = `
    <tr><td style="padding:0 0 16px;">Hi ${escapeHtml(buyerName)}, <strong>${escapeHtml(eventName)}</strong> is ${when}. Here's your ticket — show this QR at the entrance.</td></tr>
    ${qrHtml}
    <tr><td style="padding:0 0 4px;font-weight:600;">Booking ID</td></tr>
    <tr><td style="padding:0 0 16px;font-family:monospace;font-size:18px;color:${BRAND};">${escapeHtml(booking.bookingCode)}</td></tr>
    <tr><td style="padding:0 0 16px;">
      <div style="font-weight:600;">${escapeHtml(eventName)}</div>
      <div style="font-size:14px;color:#666666;">${escapeHtml(eventDate)} · ${escapeHtml(eventTime)}</div>
      ${venue ? `<div style="font-size:14px;color:#666666;">${escapeHtml(venue)}</div>` : ""}
    </td></tr>
    ${directionsUrl ? `<tr><td style="padding:0 0 8px;"><a href="${escapeHtml(directionsUrl)}" style="color:${BRAND};text-decoration:underline;font-weight:600;">Get directions</a></td></tr>` : ""}`;
  const { html, text } = renderEmail({
    preheader: `${eventName} is ${when}`,
    heading: kind === "T1" ? "Starting soon" : "See you tomorrow",
    bodyHtml,
    footerNote: unsub
      ? `A reminder for an event you booked. <a href="${escapeHtml(unsub.url)}" style="color:#666;">Unsubscribe from reminders</a>.`
      : `A reminder for an event you booked.`,
  });
  return sendMail({
    to,
    subject: `Reminder: ${eventName} is ${when}`,
    html,
    text,
    bookingId: booking.id,
    template: `event_reminder_${kind}`,
    attachments: attachments.length ? attachments : undefined,
    headers: unsub?.headers,
  });
}

// Welcome email (sent after a user verifies / for auto-verified signups).
export async function sendWelcomeEmail({ to, name }) {
  const { html, text } = renderEmail({
    preheader: `Welcome to ${APP_NAME}`,
    heading: `Welcome to ${APP_NAME}`,
    bodyHtml: `
    <tr><td style="padding:0 0 16px;">Hi ${escapeHtml(name || "there")}, your ${escapeHtml(APP_NAME)} account is ready. Discover fests and book tickets any time.</td></tr>`,
    cta: { label: "Browse events", url: `${process.env.FRONTEND_URL || "http://localhost:3000"}/fests` },
    footerNote: `Thanks for joining ${escapeHtml(APP_NAME)}.`,
  });
  return sendMail({ to, subject: `Welcome to ${APP_NAME}`, html, text, template: "welcome" });
}
