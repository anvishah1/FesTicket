// backend/src/utils/storage.js
//
// Persist base64 data URIs (sent by the frontend as { fileName, dataUrl }) to
// disk under backend/uploads/ and return a public URL that Express serves
// statically at /uploads/<file>. Used by the marketing expense-file and sponsor
// agreement routes so we never store multi-MB base64 blobs in the database.
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// backend/src/utils/storage.js -> backend/uploads
export const UPLOADS_DIR = path.resolve(__dirname, "..", "..", "uploads");

// Minimal mime -> extension map (covers the file types the UI uploads: images +
// PDFs + common docs). Anything unknown falls back to "bin".
const MIME_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

// Cap the decoded file size. The app's JSON body limit (1mb) already bounds the
// request, but validate here too so a crafted payload can't write anything huge.
const MAX_BYTES = 8 * 1024 * 1024;

const DATA_URL_RE = /^data:([^;,]+)?(;[^,]*)?,(.*)$/s;

// Pull a safe extension out of an original filename ("agreement.PDF" -> "pdf").
function extFromName(name) {
  if (!name) return null;
  const ext = path.extname(String(name)).replace(/^\./, "").toLowerCase();
  return /^[a-z0-9]{1,8}$/.test(ext) ? ext : null;
}

/**
 * Decode a base64 data URI, write it to backend/uploads/<uuid>.<ext>, and return
 * a descriptor whose `url` is the public path Express serves.
 *
 * @param {string} dataUrl e.g. "data:image/png;base64,iVBORw0K..."
 * @param {{ fileName?: string }} [opts] original filename (used for a nicer ext)
 * @returns {Promise<{ url: string, fileName: string, size: number, mimeType: string }>}
 */
export async function saveDataUrl(dataUrl, opts = {}) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    throw new Error("Invalid data URL");
  }
  const match = DATA_URL_RE.exec(dataUrl);
  if (!match) throw new Error("Malformed data URL");

  const mimeType = (match[1] || "application/octet-stream").trim();
  const encoding = match[2] || "";
  const rawData = match[3] || "";
  if (!/;base64/i.test(encoding)) {
    throw new Error("Only base64-encoded data URLs are supported");
  }

  const buffer = Buffer.from(rawData, "base64");
  if (buffer.length === 0) throw new Error("Empty file payload");
  if (buffer.length > MAX_BYTES) throw new Error("File is too large");

  const ext = MIME_EXT[mimeType] || extFromName(opts.fileName) || "bin";
  const storedName = `${randomUUID()}.${ext}`;

  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, storedName), buffer);

  return {
    url: `/uploads/${storedName}`,
    // Prefer the caller's original name for display; fall back to the stored one.
    fileName: opts.fileName ? String(opts.fileName) : storedName,
    size: buffer.length,
    mimeType,
  };
}

export default { saveDataUrl, UPLOADS_DIR };
