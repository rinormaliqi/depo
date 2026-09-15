import { createHash } from "crypto";

// Paysera "Checkout Classic" (WebToPay) — the hosted-page flow, done as
// two pure functions instead of a dependency. Reference: paysera/lib-webtopay
// (WebToPay.php): the request is `data` = url-safe base64 of a query string,
// `sign` = md5(data + project password); the callback comes back as a GET
// with the same `data` encoding plus `ss1` = md5(data + password) (and
// RSA `ss2`/`ss3`, which we don't need — ss1 with the shared secret is
// what the official library checks when OpenSSL isn't in play).
//
// Chosen over Paysera's newer OAuth "Checkout Modern" API because Classic
// is a redirect + one signed GET, needs only a project id and password,
// and is what their sandbox/test mode is documented against. Nothing here
// stores card data — Paysera hosts the payment page.

export const PAYSERA_PAY_URL = "https://bank.paysera.com/pay/";
const PROTOCOL_VERSION = "1.6";

export type PayseraConfig = { projectId: string; signPassword: string; testMode: boolean };

// Absent config = online payment isn't set up in this environment. The
// billing page then shows the bank-transfer / contact path only, the
// same way email falls back to console logging without RESEND_API_KEY.
export function getPayseraConfig(): PayseraConfig | null {
  const projectId = process.env.PAYSERA_PROJECT_ID?.trim();
  const signPassword = process.env.PAYSERA_SIGN_PASSWORD?.trim();
  if (!projectId || !signPassword) return null;
  return { projectId, signPassword, testMode: process.env.PAYSERA_TEST_MODE === "1" };
}

export function encodeSafeBase64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

export function decodeSafeBase64(encoded: string): string {
  return Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function sign(data: string, password: string): string {
  return createHash("md5").update(data + password).digest("hex");
}

export type PayseraPaymentRequest = {
  orderId: string; // ≤ 40 chars — we pass payments.id
  amountCents: number;
  currency: string; // ISO 4217, e.g. "EUR"
  acceptUrl: string;
  cancelUrl: string;
  callbackUrl: string;
  payText?: string; // ≤ 255, shown on the payment page and bank statement
  payerEmail?: string;
  lang?: "ENG" | "LIT" | "RUS" | "LAV" | "EST" | "POL" | "BUL" | "ROM" | "SQI";
};

export function buildPayseraPaymentUrl(config: PayseraConfig, req: PayseraPaymentRequest): string {
  const params = new URLSearchParams({
    projectid: config.projectId,
    orderid: req.orderId,
    amount: String(req.amountCents),
    currency: req.currency,
    accepturl: req.acceptUrl,
    cancelurl: req.cancelUrl,
    callbackurl: req.callbackUrl,
    version: PROTOCOL_VERSION,
    test: config.testMode ? "1" : "0",
  });
  if (req.payText) params.set("paytext", req.payText);
  if (req.payerEmail) params.set("p_email", req.payerEmail);
  if (req.lang) params.set("lang", req.lang);

  const data = encodeSafeBase64(params.toString());
  return `${PAYSERA_PAY_URL}?data=${encodeURIComponent(data)}&sign=${sign(data, config.signPassword)}`;
}

// Paysera's `status` values in the callback.
export const PAYSERA_STATUS = {
  NOT_EXECUTED: "0",
  PAID: "1",
  ACCEPTED_NOT_EXECUTED: "2", // e.g. bank transfer initiated, funds not yet in
  ADDITIONAL_INFO: "3",
} as const;

export type PayseraCallback = {
  projectid: string;
  orderid: string;
  status: string;
  amount?: string;
  currency?: string;
  payamount?: string;
  paycurrency?: string;
  requestid?: string;
  test?: string;
  payment?: string;
  p_email?: string;
  [key: string]: string | undefined;
};

// Returns the decoded callback fields, or null if the signature doesn't
// check out or the callback is for a different project. Everything a
// caller does with the result must be gated on this returning non-null.
export function verifyPayseraCallback(config: PayseraConfig, query: URLSearchParams): PayseraCallback | null {
  const data = query.get("data");
  const ss1 = query.get("ss1");
  if (!data || !ss1) return null;
  if (sign(data, config.signPassword) !== ss1) return null;

  const fields: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(decodeSafeBase64(data))) fields[k] = v;
  if (fields.projectid !== config.projectId) return null;
  if (!fields.orderid || fields.status === undefined) return null;
  return fields as PayseraCallback;
}
