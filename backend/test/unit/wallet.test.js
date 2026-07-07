import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";

// A throwaway RSA keypair so we can sign + verify a real RS256 save-link JWT.
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

const APPLE_ENV = [
  "APPLE_WALLET_PASS_TYPE_ID",
  "APPLE_WALLET_TEAM_ID",
  "APPLE_WALLET_SIGNER_CERT",
  "APPLE_WALLET_SIGNER_KEY",
  "APPLE_WALLET_WWDR_CERT",
  "APPLE_WALLET_ORG_NAME",
];
const GOOGLE_ENV = ["GOOGLE_WALLET_ISSUER_ID", "GOOGLE_WALLET_SA_EMAIL", "GOOGLE_WALLET_SA_KEY", "GOOGLE_WALLET_CLASS_SUFFIX"];

function clearWalletEnv() {
  for (const k of [...APPLE_ENV, ...GOOGLE_ENV, "APPLE_WALLET_SIGNER_KEY_PASSPHRASE"]) delete process.env[k];
}

const event = { name: "Spring Fest", venue: "Main Hall", venueAddress: "12 College Rd", startDate: "2026-05-01T18:00:00Z", startTime: "6:00 PM" };
const attendee = { name: "Alice", ticketCode: "tkt_abc123", ticketType: "VIP" };

beforeEach(() => clearWalletEnv());
afterEach(() => {
  clearWalletEnv();
  vi.resetModules();
});

describe("wallet config gates", () => {
  it("reports both wallets unavailable when env is unset", async () => {
    const { walletAvailability, getAppleWalletConfig, getGoogleWalletConfig } = await import("../../src/utils/wallet.js");
    expect(getAppleWalletConfig()).toBeNull();
    expect(getGoogleWalletConfig()).toBeNull();
    expect(walletAvailability()).toEqual({ apple: false, google: false });
  });

  it("reports google available once its issuer creds are set", async () => {
    process.env.GOOGLE_WALLET_ISSUER_ID = "3388000000022222228";
    process.env.GOOGLE_WALLET_SA_EMAIL = "sa@example.iam.gserviceaccount.com";
    process.env.GOOGLE_WALLET_SA_KEY = privateKey;
    const { walletAvailability } = await import("../../src/utils/wallet.js");
    expect(walletAvailability()).toEqual({ apple: false, google: true });
  });

  it("accepts base64-encoded apple certs", async () => {
    process.env.APPLE_WALLET_PASS_TYPE_ID = "pass.com.tiqr.ticket";
    process.env.APPLE_WALLET_TEAM_ID = "ABCDE12345";
    process.env.APPLE_WALLET_SIGNER_CERT = Buffer.from("-----BEGIN CERTIFICATE-----x-----END CERTIFICATE-----").toString("base64");
    process.env.APPLE_WALLET_SIGNER_KEY = Buffer.from("-----BEGIN PRIVATE KEY-----y-----END PRIVATE KEY-----").toString("base64");
    process.env.APPLE_WALLET_WWDR_CERT = Buffer.from("-----BEGIN CERTIFICATE-----z-----END CERTIFICATE-----").toString("base64");
    const { getAppleWalletConfig } = await import("../../src/utils/wallet.js");
    const cfg = getAppleWalletConfig();
    expect(cfg).not.toBeNull();
    expect(cfg.passTypeId).toBe("pass.com.tiqr.ticket");
    expect(cfg.signerCert.toString("utf8")).toContain("BEGIN CERTIFICATE");
  });
});

describe("buildGoogleSaveUrl", () => {
  beforeEach(() => {
    process.env.GOOGLE_WALLET_ISSUER_ID = "3388000000022222228";
    process.env.GOOGLE_WALLET_SA_EMAIL = "sa@example.iam.gserviceaccount.com";
    process.env.GOOGLE_WALLET_SA_KEY = privateKey;
  });

  it("returns a pay.google.com save URL with a verifiable RS256 JWT", async () => {
    const { buildGoogleSaveUrl } = await import("../../src/utils/wallet.js");
    const url = buildGoogleSaveUrl({ event, attendee });
    expect(url).toMatch(/^https:\/\/pay\.google\.com\/gp\/v\/save\//);

    const token = url.split("/save/")[1];
    const decoded = jwt.verify(token, publicKey, { algorithms: ["RS256"] });
    expect(decoded.iss).toBe("sa@example.iam.gserviceaccount.com");
    expect(decoded.typ).toBe("savetowallet");

    const obj = decoded.payload.eventTicketObjects[0];
    expect(obj.barcode).toEqual(expect.objectContaining({ type: "QR_CODE", value: "tkt_abc123" }));
    expect(obj.ticketHolderName).toBe("Alice");
    expect(obj.id).toContain("tkt_abc123");
    const cls = decoded.payload.eventTicketClasses[0];
    expect(cls.eventName.defaultValue.value).toBe("Spring Fest");
  });

  it("throws WALLET_DISABLED when google is unconfigured", async () => {
    clearWalletEnv();
    const { buildGoogleSaveUrl } = await import("../../src/utils/wallet.js");
    expect(() => buildGoogleSaveUrl({ event, attendee })).toThrow(/WALLET_DISABLED/);
  });
});

describe("buildApplePkpass", () => {
  it("builds a pass with the attendee ticketCode as the QR barcode", async () => {
    // Mock the signing library so we can assert the pass composition without
    // real Apple certs.
    const setBarcodes = vi.fn();
    const primaryFields = [];
    const secondaryFields = [];
    const auxiliaryFields = [];
    const backFields = [];
    const ctorArgs = {};
    class MockPKPass {
      constructor(buffers, certs, props) {
        ctorArgs.buffers = buffers;
        ctorArgs.certs = certs;
        ctorArgs.props = props;
      }
      set type(v) {
        ctorArgs.type = v;
      }
      get primaryFields() {
        return primaryFields;
      }
      get secondaryFields() {
        return secondaryFields;
      }
      get auxiliaryFields() {
        return auxiliaryFields;
      }
      get backFields() {
        return backFields;
      }
      setBarcodes(b) {
        setBarcodes(b);
      }
      getAsBuffer() {
        return Buffer.from("PKPASSDATA");
      }
    }
    vi.doMock("passkit-generator", () => ({ PKPass: MockPKPass }));

    process.env.APPLE_WALLET_PASS_TYPE_ID = "pass.com.tiqr.ticket";
    process.env.APPLE_WALLET_TEAM_ID = "ABCDE12345";
    process.env.APPLE_WALLET_SIGNER_CERT = Buffer.from("cert").toString("base64");
    process.env.APPLE_WALLET_SIGNER_KEY = Buffer.from("key").toString("base64");
    process.env.APPLE_WALLET_WWDR_CERT = Buffer.from("wwdr").toString("base64");

    const { buildApplePkpass } = await import("../../src/utils/wallet.js");
    const buf = await buildApplePkpass({ event, attendee });

    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString()).toBe("PKPASSDATA");
    expect(ctorArgs.type).toBe("eventTicket");
    expect(ctorArgs.props).toEqual(expect.objectContaining({ passTypeIdentifier: "pass.com.tiqr.ticket", serialNumber: "tkt_abc123" }));
    expect(setBarcodes).toHaveBeenCalledWith(expect.objectContaining({ message: "tkt_abc123", format: "PKBarcodeFormatQR" }));
    expect(primaryFields[0]).toEqual({ key: "event", label: "EVENT", value: "Spring Fest" });
    expect(auxiliaryFields.some((f) => f.value === "Alice")).toBe(true);

    vi.doUnmock("passkit-generator");
  });

  it("throws WALLET_DISABLED when apple is unconfigured", async () => {
    clearWalletEnv();
    const { buildApplePkpass } = await import("../../src/utils/wallet.js");
    await expect(buildApplePkpass({ event, attendee })).rejects.toThrow(/WALLET_DISABLED/);
  });
});
