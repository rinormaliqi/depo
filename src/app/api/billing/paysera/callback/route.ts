import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { applyPaidPayment } from "@/lib/billing";
import { PAYSERA_STATUS, getPayseraConfig, verifyPayseraCallback } from "@/lib/paysera";

// Paysera calls this server-to-server after a payment (GET, per their
// Classic protocol). It's the only path that turns a pending payment into
// access. Must answer a plain "OK" body or Paysera keeps retrying — which
// is also why every early exit that isn't "bad signature" still says OK:
// a permanently-wrong callback shouldn't be redelivered forever.
export async function GET(request: Request) {
  const config = getPayseraConfig();
  if (!config) return new NextResponse("Not configured", { status: 503 });

  const callback = verifyPayseraCallback(config, new URL(request.url).searchParams);
  if (!callback) return new NextResponse("Invalid signature", { status: 400 });

  const [payment] = await db.select().from(payments).where(eq(payments.id, callback.orderid));
  if (!payment || payment.provider !== "paysera") {
    console.error("[paysera] callback for unknown order", callback.orderid);
    return new NextResponse("OK");
  }

  // A test-mode callback must never pay for a real order, and vice versa.
  if ((callback.test === "1") !== config.testMode) {
    console.error("[paysera] test-mode mismatch for order", payment.id);
    return new NextResponse("OK");
  }

  if (callback.status === PAYSERA_STATUS.PAID) {
    // Guard against a tampered amount on Paysera's side of the redirect:
    // the callback reports what was actually paid, and it has to be what
    // we asked for.
    const paid = Number(callback.payamount ?? callback.amount);
    const currency = (callback.paycurrency ?? callback.currency ?? "").toUpperCase();
    if (paid !== payment.amountCents || currency !== payment.currency) {
      console.error("[paysera] amount mismatch", { expected: [payment.amountCents, payment.currency], got: [paid, currency] });
      await db.update(payments).set({ status: "failed", providerReference: callback.requestid }).where(eq(payments.id, payment.id));
      return new NextResponse("OK");
    }
    await applyPaidPayment(payment.id, { providerReference: callback.requestid, payerEmail: callback.p_email ?? payment.payerEmail ?? undefined });
  } else if (callback.status === PAYSERA_STATUS.NOT_EXECUTED) {
    if (payment.status === "pending") {
      await db.update(payments).set({ status: "failed", providerReference: callback.requestid }).where(eq(payments.id, payment.id));
    }
  }
  // ACCEPTED_NOT_EXECUTED (2) and ADDITIONAL_INFO (3): leave pending; a
  // later callback with status 1 settles it.

  return new NextResponse("OK");
}
