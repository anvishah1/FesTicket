// backend/src/utils/sms.js
//
// NOTIF-07: optional SMS / WhatsApp ticket delivery. Graceful degradation exactly
// like email — when the selected provider's keys are unset, every send returns
// { sent:false, reason:"not_configured" } and NEVER throws, so completion paths
// are unaffected on deployments without an SMS provider.
//
// Provider is chosen by SMS_PROVIDER (msg91 | gupshup | twilio). All calls are
// plain HTTPS (no SDK dependency). Note: Indian DLT requires pre-registered
// sender IDs + templates for msg91/gupshup, and WhatsApp requires approved
// templates + opt-in — the free-form body here is fine for transactional/testing
// but production senders should wire a registered template.

import logger from "./logger.js";

// Normalize a phone number to E.164 (default country +91 India). Returns null for
// an unusable/blank number so the caller can skip without error.
export function toE164(raw, defaultCountry = process.env.SMS_DEFAULT_COUNTRY || "+91") {
  if (!raw) return null;
  let s = String(raw).trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("+")) return /^\+\d{8,15}$/.test(s) ? s : null;
  if (s.startsWith("00")) {
    s = "+" + s.slice(2);
    return /^\+\d{8,15}$/.test(s) ? s : null;
  }
  s = s.replace(/^0+/, ""); // drop a national trunk prefix
  if (!/^\d{6,14}$/.test(s)) return null;
  const cc = defaultCountry.startsWith("+") ? defaultCountry : `+${defaultCountry}`;
  return `${cc}${s}`;
}

export function getSmsProvider() {
  return (process.env.SMS_PROVIDER || "").toLowerCase();
}

// True when the selected provider has its credentials. Used by tests + callers.
export function isSmsConfigured() {
  const p = getSmsProvider();
  if (p === "twilio") return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  if (p === "msg91") return !!(process.env.MSG91_AUTHKEY && process.env.MSG91_SENDER_ID);
  if (p === "gupshup") return !!(process.env.GUPSHUP_USER_ID && process.env.GUPSHUP_PASSWORD);
  return false;
}

async function dispatch(kind, { to, body }) {
  const provider = getSmsProvider();
  if (!provider) return { sent: false, reason: "not_configured" };
  const e164 = toE164(to);
  if (!e164) return { sent: false, reason: "invalid_number" };

  try {
    if (provider === "twilio") {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      const from = kind === "whatsapp" ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_SMS_FROM;
      if (!sid || !token || !from) return { sent: false, reason: "not_configured" };
      const dest = kind === "whatsapp" ? `whatsapp:${e164}` : e164;
      const params = new URLSearchParams({ To: dest, From: from, Body: body });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: "Basic " + Buffer.from(`${sid}:${token}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });
      if (!res.ok) throw new Error(`twilio ${res.status}`);
      return { sent: true };
    }

    if (provider === "msg91") {
      const authkey = process.env.MSG91_AUTHKEY;
      const sender = process.env.MSG91_SENDER_ID;
      if (!authkey || !sender) return { sent: false, reason: "not_configured" };
      const mobiles = e164.replace(/^\+/, "");
      const url =
        `https://api.msg91.com/api/sendhttp.php?authkey=${encodeURIComponent(authkey)}` +
        `&mobiles=${encodeURIComponent(mobiles)}&message=${encodeURIComponent(body)}` +
        `&sender=${encodeURIComponent(sender)}&route=4&country=91`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`msg91 ${res.status}`);
      return { sent: true };
    }

    if (provider === "gupshup") {
      const userid = process.env.GUPSHUP_USER_ID;
      const password = process.env.GUPSHUP_PASSWORD;
      if (!userid || !password) return { sent: false, reason: "not_configured" };
      const send_to = e164.replace(/^\+/, "");
      const params = new URLSearchParams({
        method: "SendMessage",
        send_to,
        msg: body,
        msg_type: kind === "whatsapp" ? "HSM" : "TEXT",
        userid,
        password,
        auth_scheme: "plain",
        v: "1.1",
        format: "text",
      });
      const res = await fetch(`https://enterprise.smsgupshup.com/GatewayAPI/rest?${params.toString()}`);
      if (!res.ok) throw new Error(`gupshup ${res.status}`);
      return { sent: true };
    }

    return { sent: false, reason: "not_configured" };
  } catch (err) {
    // Never throw out of a send — mirror the email path.
    logger.error({ err, provider, kind }, "[sms] send failed");
    return { sent: false, error: String(err?.message || err) };
  }
}

export async function sendSms({ to, body }) {
  return dispatch("sms", { to, body });
}

export async function sendWhatsApp({ to, body }) {
  return dispatch("whatsapp", { to, body });
}
