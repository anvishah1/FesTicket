/*
 * CAPTCHA verification (graceful, house style).
 *
 * If CAPTCHA_SECRET is unset the integration is considered DISABLED and every
 * token verifies as true, so signup/signin keep working with no provider wired
 * up (mirrors the Razorpay/email graceful-degradation pattern). When a secret
 * IS configured we call the provider (Cloudflare Turnstile by default) and
 * fail CLOSED on any network/parse error — an attacker can't bypass the check
 * by knocking the provider offline.
 */
const DEFAULT_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyCaptcha(token, remoteIp) {
  const secret = process.env.CAPTCHA_SECRET;

  // Integration disabled -> graceful pass.
  if (!secret) return true;

  try {
    const url = process.env.CAPTCHA_VERIFY_URL || DEFAULT_VERIFY_URL;

    const body = new URLSearchParams({
      secret,
      response: token ?? "",
    });
    if (remoteIp) body.set("remoteip", remoteIp);

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const json = await resp.json();
    return json.success === true;
  } catch (err) {
    // Fail closed when a provider is configured but unreachable/unparsable.
    console.error("[captcha] verification failed:", err);
    return false;
  }
}

export default { verifyCaptcha };
