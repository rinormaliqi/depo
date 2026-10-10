// Checks shared by the upload routes (underlay, signed contract), #194.
//
// A browser's `file.type` is whatever the sender says it is, so the bytes
// are what decide: a file is accepted only when its first bytes are those
// of the type it claims. The signed contract is emailed to support as an
// attachment, and a claimed PDF that is really something else must not
// reach an inbox looking like one.

export type SniffedType = "image/png" | "image/jpeg" | "image/webp" | "application/pdf";

function startsWith(bytes: Uint8Array, sig: number[], offset = 0) {
  return bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);
}

export function sniffType(bytes: Uint8Array): SniffedType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  return null;
}

// Multipart framing (boundaries, part headers, small text fields) on top
// of the file itself.
const MULTIPART_SLACK = 64 * 1024;

// True when the request declares a body bigger than any acceptable upload,
// so it can be refused before the body is read into memory. A missing or
// unparsable Content-Length is left to the per-file size check.
export function declaredTooLarge(req: Request, maxFileBytes: number) {
  const n = Number(req.headers.get("content-length"));
  return Number.isFinite(n) && n > maxFileBytes + MULTIPART_SLACK;
}

const EXTENSION: Record<SniffedType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

// A name safe to store and to put in an email attachment: no path, no
// control or quoting characters, at most 80 characters, and the extension
// of the type the bytes actually are — "invoice.pdf.exe" becomes
// "invoice.pdf.pdf", never an executable name.
export function safeFileName(name: string, type: SniffedType, fallback: string) {
  const base = name
    .split(/[\\/]/).pop()!
    .replace(/[\u0000-\u001f\u007f"'<>|*?:;]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .slice(0, 80)
    .trim();
  return `${base || fallback}.${EXTENSION[type]}`;
}
