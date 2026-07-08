// backend/src/utils/twofactor.js
//
// AUTH-08: TOTP two-factor helpers. The TOTP secret is ENCRYPTED at rest
// (AES-256-GCM) and backup codes are stored HASHED (sha256) — never plaintext.

import crypto from "node:crypto";
import * as otp from "otplib";

const ISSUER = "tiqr";

// 32-byte key derived from a dedicated secret (falls back to JWT_SECRET so the
// feature works without extra config; set TWO_FACTOR_ENC_KEY in production).
function encKey() {
  const material = process.env.TWO_FACTOR_ENC_KEY || process.env.JWT_SECRET || "dev-insecure-key";
  return crypto.createHash("sha256").update(material).digest(); // 32 bytes
}

// "ivHex:tagHex:cipherHex"
export function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export function decryptSecret(stored) {
  if (!stored || typeof stored !== "string") return null;
  const [ivHex, tagHex, dataHex] = stored.split(":");
  if (!ivHex || !tagHex || !dataHex) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", encKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

// A fresh base32 TOTP secret.
export async function generateSecret() {
  return otp.generateSecret();
}

// otpauth:// URI for the authenticator app QR.
export function keyUri(accountEmail, secret) {
  return otp.generateURI({ secret, label: accountEmail || "account", issuer: ISSUER });
}

// Verify a 6-digit code against the secret (allows a small clock skew window).
export async function verifyToken(secret, token) {
  if (!secret || typeof token !== "string" || !/^\d{6}$/.test(token.trim())) return false;
  try {
    const res = await otp.verify({ token: token.trim(), secret });
    return !!res?.valid;
  } catch {
    return false;
  }
}

export function hashBackupCode(code) {
  return crypto.createHash("sha256").update(String(code).trim().toUpperCase()).digest("hex");
}

// 10 human-friendly one-time codes; returns the plaintext (shown once) + hashes.
// 64 bits of entropy each (Phase-5 review P3: 32-bit codes are brute-forceable
// offline if the hash set leaks — 64-bit makes precomputation infeasible).
export function generateBackupCodes(count = 10) {
  const plain = [];
  const hashed = [];
  for (let i = 0; i < count; i++) {
    // 16 hex chars (8 random bytes), grouped XXXX-XXXX-XXXX-XXXX.
    const raw = crypto.randomBytes(8).toString("hex").toUpperCase();
    const code = raw.match(/.{4}/g).join("-");
    plain.push(code);
    hashed.push(hashBackupCode(code));
  }
  return { plain, hashed };
}
