// Limits for the signed contract a customer uploads (a scan or photo of a
// signed page, or a PDF) — same shape as underlay-shared.ts's limits for
// the same reason: a route handler validates a multipart upload, not a
// server action.
export const SIGNED_CONTRACT_MAX_BYTES = 8 * 1024 * 1024;
export const SIGNED_CONTRACT_MIME = ["application/pdf", "image/png", "image/jpeg"] as const;
