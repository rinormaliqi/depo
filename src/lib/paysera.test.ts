import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { buildPayseraPaymentUrl, decodeSafeBase64, encodeSafeBase64, verifyPayseraCallback } from "./paysera";

const config = { projectId: "12345", signPassword: "s3cret", testMode: true };

test("safe base64 round-trips and uses -_ instead of +/", () => {
  const text = "a=1&b=??>>~~"; // produces + and / in plain base64
  const enc = encodeSafeBase64(text);
  assert.doesNotMatch(enc, /[+/]/);
  assert.equal(decodeSafeBase64(enc), text);
});

test("payment url carries the signed request with every required field", () => {
  const url = new URL(
    buildPayseraPaymentUrl(config, {
      orderId: "order-1",
      amountCents: 21900,
      currency: "EUR",
      acceptUrl: "https://app/billing/return",
      cancelUrl: "https://app/billing",
      callbackUrl: "https://app/api/billing/paysera/callback",
      payText: "SmartDepo Business × 1",
    }),
  );
  const data = url.searchParams.get("data")!;
  const expectedSign = createHash("md5").update(data + config.signPassword).digest("hex");
  assert.equal(url.searchParams.get("sign"), expectedSign);
  const fields = Object.fromEntries(new URLSearchParams(decodeSafeBase64(data)));
  assert.equal(fields.projectid, "12345");
  assert.equal(fields.orderid, "order-1");
  assert.equal(fields.amount, "21900");
  assert.equal(fields.currency, "EUR");
  assert.equal(fields.test, "1");
  assert.equal(fields.callbackurl, "https://app/api/billing/paysera/callback");
});

function callbackQuery(fields: Record<string, string>, password = config.signPassword) {
  const data = encodeSafeBase64(new URLSearchParams(fields).toString());
  const ss1 = createHash("md5").update(data + password).digest("hex");
  return new URLSearchParams({ data, ss1 });
}

test("callback with a valid ss1 is decoded", () => {
  const cb = verifyPayseraCallback(config, callbackQuery({ projectid: "12345", orderid: "o1", status: "1", payamount: "21900", paycurrency: "EUR" }));
  assert.ok(cb);
  assert.equal(cb.orderid, "o1");
  assert.equal(cb.status, "1");
  assert.equal(cb.payamount, "21900");
});

test("callback with a bad signature, wrong project, or missing fields is rejected", () => {
  assert.equal(verifyPayseraCallback(config, callbackQuery({ projectid: "12345", orderid: "o1", status: "1" }, "wrong")), null);
  assert.equal(verifyPayseraCallback(config, callbackQuery({ projectid: "999", orderid: "o1", status: "1" })), null);
  assert.equal(verifyPayseraCallback(config, callbackQuery({ projectid: "12345", status: "1" })), null);
  assert.equal(verifyPayseraCallback(config, new URLSearchParams({ data: "x" })), null);
});
