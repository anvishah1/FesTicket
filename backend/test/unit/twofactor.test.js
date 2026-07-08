import { describe, it, expect } from "vitest";
import * as otp from "otplib";
import {
  encryptSecret,
  decryptSecret,
  generateSecret,
  keyUri,
  verifyToken,
  generateBackupCodes,
  hashBackupCode,
} from "../../src/utils/twofactor.js";

describe("2FA secret encryption (AUTH-08)", () => {
  it("round-trips a secret and never stores plaintext", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const enc = encryptSecret(secret);
    expect(enc).not.toContain(secret); // ciphertext, not plaintext
    expect(enc.split(":")).toHaveLength(3); // iv:tag:cipher
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("returns null for tampered / malformed ciphertext", () => {
    const enc = encryptSecret("SECRET");
    expect(decryptSecret(enc.slice(0, -4) + "0000")).toBeNull();
    expect(decryptSecret("garbage")).toBeNull();
    expect(decryptSecret(null)).toBeNull();
  });
});

describe("TOTP verify (AUTH-08)", () => {
  it("accepts a fresh code for the secret and rejects a wrong one", async () => {
    const secret = await generateSecret();
    const token = await otp.generate({ secret });
    expect(await verifyToken(secret, token)).toBe(true);
    expect(await verifyToken(secret, "000000")).toBe(false);
    expect(await verifyToken(secret, "notacode")).toBe(false);
  });

  it("builds an otpauth URI with the issuer", () => {
    expect(keyUri("a@x.com", "SECRET")).toMatch(/^otpauth:\/\/totp\/.*issuer=tiqr/);
  });
});

describe("backup codes (AUTH-08)", () => {
  it("generates 10 formatted codes with matching hashes", () => {
    const { plain, hashed } = generateBackupCodes();
    expect(plain).toHaveLength(10);
    expect(hashed).toHaveLength(10);
    // 64-bit codes (Phase-5 review P3): XXXX-XXXX-XXXX-XXXX.
    expect(plain[0]).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    // The hash matches the same code, case-insensitively.
    expect(hashBackupCode(plain[0].toLowerCase())).toBe(hashed[0]);
    expect(hashBackupCode("WRONG-CODE")).not.toBe(hashed[0]);
  });
});
