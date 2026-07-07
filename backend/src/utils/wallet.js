// backend/src/utils/wallet.js
//
// TIX-07: Apple Wallet (.pkpass) + Google Wallet (save link) pass generation.
//
// Everything here is OPTIONAL and gated, mirroring the Razorpay/email pattern:
// when the signing credentials aren't configured the route returns
// 503 WALLET_DISABLED and the UI hides the buttons. Certs/keys are NEVER
// committed — they come from env (see backend/.env.example).
//
// Apple: needs an Apple Developer Pass Type ID + WWDR cert; signing (PKCS#7) is
// delegated to passkit-generator (dynamically imported so the dep only loads
// when a pass is actually requested).
// Google: a save link is an RS256 JWT signed with the issuer's service-account
// private key — built with the already-present `jsonwebtoken`, no extra dep.

import zlib from "node:zlib";
import jwt from "jsonwebtoken";

// ---------------------------------------------------------------------------
// Config gates
// ---------------------------------------------------------------------------

// Certs are supplied base64-encoded in env (binary/multiline PEM doesn't survive
// a plain env var). Decode to a Buffer; tolerate an already-PEM value too.
function decodeCert(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.includes("-----BEGIN")) return Buffer.from(trimmed, "utf8");
  return Buffer.from(trimmed, "base64");
}

// A private key may arrive as real PEM, base64 PEM, or with literal "\n"
// sequences (common when pasting a service-account key into an env var).
function decodePrivateKey(value) {
  if (!value) return null;
  let v = value.trim();
  if (v.includes("\\n")) v = v.replace(/\\n/g, "\n");
  if (v.includes("-----BEGIN")) return v;
  return Buffer.from(v, "base64").toString("utf8");
}

export function getAppleWalletConfig() {
  const passTypeId = process.env.APPLE_WALLET_PASS_TYPE_ID;
  const teamId = process.env.APPLE_WALLET_TEAM_ID;
  const signerCert = decodeCert(process.env.APPLE_WALLET_SIGNER_CERT);
  const signerKey = decodeCert(process.env.APPLE_WALLET_SIGNER_KEY);
  const wwdr = decodeCert(process.env.APPLE_WALLET_WWDR_CERT);
  if (!passTypeId || !teamId || !signerCert || !signerKey || !wwdr) return null;
  return {
    passTypeId,
    teamId,
    signerCert,
    signerKey,
    wwdr,
    signerKeyPassphrase: process.env.APPLE_WALLET_SIGNER_KEY_PASSPHRASE || undefined,
    organizationName: process.env.APPLE_WALLET_ORG_NAME || "tiqr",
  };
}

export function getGoogleWalletConfig() {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID;
  const serviceAccountEmail = process.env.GOOGLE_WALLET_SA_EMAIL;
  const serviceAccountKey = decodePrivateKey(process.env.GOOGLE_WALLET_SA_KEY);
  if (!issuerId || !serviceAccountEmail || !serviceAccountKey) return null;
  return {
    issuerId,
    serviceAccountEmail,
    serviceAccountKey,
    // A stable class per deployment; objects reference it inline in the JWT.
    classSuffix: process.env.GOOGLE_WALLET_CLASS_SUFFIX || "tiqr_event",
  };
}

// Convenience for the UI/route: which wallets are live right now.
export function walletAvailability() {
  return { apple: !!getAppleWalletConfig(), google: !!getGoogleWalletConfig() };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// Human date/time for the pass face. startTime is a free-form String in the
// schema, so only append it when present. Falls back gracefully on null dates.
function formatEventDate(event) {
  if (!event?.startDate) return event?.startTime || "";
  const d = new Date(event.startDate);
  if (Number.isNaN(d.getTime())) return event?.startTime || "";
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return event.startTime ? `${date}, ${event.startTime}` : date;
}

function eventLocation(event) {
  return event?.venueAddress || event?.venue || "";
}

// Minimal solid-colour PNG encoder — Apple passes require an icon.png (and
// logo.png). A dependency-free brand square keeps the pass self-contained.
function solidPng(size, [r, g, b]) {
  const crcTable = solidPng._t || (solidPng._t = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const tb = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
    return Buffer.concat([len, tb, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0;
    for (let x = 0; x < size; x++) {
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = 255;
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Apple Wallet (.pkpass)
// ---------------------------------------------------------------------------

// Build a signed .pkpass Buffer for one attendee's ticket. The barcode payload
// is the per-attendee ticketCode (TIX-02) so a gate scan resolves the attendee.
export async function buildApplePkpass({ event, attendee }) {
  const cfg = getAppleWalletConfig();
  if (!cfg) throw new Error("WALLET_DISABLED");

  const { PKPass } = await import("passkit-generator");
  const brand = solidPng(58, [0x52, 0x2c, 0x5d]);

  const pass = new PKPass(
    {
      "icon.png": brand,
      "icon@2x.png": brand,
      "logo.png": brand,
      "logo@2x.png": brand,
    },
    {
      wwdr: cfg.wwdr,
      signerCert: cfg.signerCert,
      signerKey: cfg.signerKey,
      signerKeyPassphrase: cfg.signerKeyPassphrase,
    },
    {
      passTypeIdentifier: cfg.passTypeId,
      teamIdentifier: cfg.teamId,
      organizationName: cfg.organizationName,
      description: `${event.name} ticket`,
      serialNumber: attendee.ticketCode,
      foregroundColor: "rgb(255, 255, 255)",
      backgroundColor: "rgb(82, 44, 93)",
      labelColor: "rgb(255, 255, 255)",
    }
  );

  pass.type = "eventTicket";

  // QR encodes the attendee ticketCode; iso-8859-1 is the Wallet default.
  pass.setBarcodes({
    message: attendee.ticketCode,
    format: "PKBarcodeFormatQR",
    messageEncoding: "iso-8859-1",
    altText: attendee.ticketCode,
  });

  pass.primaryFields.push({ key: "event", label: "EVENT", value: event.name });

  const dateStr = formatEventDate(event);
  if (dateStr) pass.secondaryFields.push({ key: "date", label: "DATE", value: dateStr });
  const loc = eventLocation(event);
  if (loc) pass.secondaryFields.push({ key: "venue", label: "VENUE", value: loc });

  if (attendee.name) pass.auxiliaryFields.push({ key: "attendee", label: "ATTENDEE", value: attendee.name });
  if (attendee.ticketType) pass.auxiliaryFields.push({ key: "ticket", label: "TICKET", value: attendee.ticketType });

  pass.backFields.push({ key: "code", label: "Ticket code", value: attendee.ticketCode });

  return pass.getAsBuffer();
}

// ---------------------------------------------------------------------------
// Google Wallet (save link)
// ---------------------------------------------------------------------------

// Return a https://pay.google.com/gp/v/save/<jwt> URL. The JWT carries the event
// class + ticket object inline and is RS256-signed with the issuer's
// service-account key, so no pre-provisioning API call is needed at request time.
export function buildGoogleSaveUrl({ event, attendee }) {
  const cfg = getGoogleWalletConfig();
  if (!cfg) throw new Error("WALLET_DISABLED");

  const classId = `${cfg.issuerId}.${cfg.classSuffix}`;
  // Object ids must be unique + [A-Za-z0-9._-]; ticketCode is a cuid/uuid.
  const objectId = `${cfg.issuerId}.${String(attendee.ticketCode).replace(/[^\w.-]/g, "")}`;

  const eventTicketClass = {
    id: classId,
    issuerName: "tiqr",
    reviewStatus: "UNDER_REVIEW",
    eventName: { defaultValue: { language: "en-US", value: event.name || "Event" } },
  };

  const eventTicketObject = {
    id: objectId,
    classId,
    state: "ACTIVE",
    barcode: { type: "QR_CODE", value: attendee.ticketCode, alternateText: attendee.ticketCode },
    ticketHolderName: attendee.name || undefined,
    ticketType: attendee.ticketType ? { defaultValue: { language: "en-US", value: attendee.ticketType } } : undefined,
  };

  const loc = eventLocation(event);
  if (loc) eventTicketObject.venue = { name: { defaultValue: { language: "en-US", value: loc } } };
  if (event?.startDate) {
    const d = new Date(event.startDate);
    if (!Number.isNaN(d.getTime())) eventTicketObject.dateTime = { start: d.toISOString() };
  }

  const claims = {
    iss: cfg.serviceAccountEmail,
    aud: "google",
    typ: "savetowallet",
    origins: [],
    payload: {
      eventTicketClasses: [eventTicketClass],
      eventTicketObjects: [eventTicketObject],
    },
  };

  const token = jwt.sign(claims, cfg.serviceAccountKey, { algorithm: "RS256" });
  return `https://pay.google.com/gp/v/save/${token}`;
}
