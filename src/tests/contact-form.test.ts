import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { sendContactMessage } from "@/app/contact/actions";
import { db } from "@/db";
import { contactMessages } from "@/db/schema";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}
const good = { name: "Agron", company: "Depo Rinia", email: "agron@example.com", message: "Sa kushton për 3 objekte?", startedAt: String(Date.now() - 10_000) };

describe("contact form", () => {
  before(freshDatabase);

  test("a real message is stored, marked sent (email logs without SMTP), and reported ok", async () => {
    const result = await sendContactMessage(undefined, form(good));
    assert.equal(result?.ok, true);
    const rows = await db.select().from(contactMessages);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, "agron@example.com");
    assert.equal(rows[0].company, "Depo Rinia");
    assert.ok(rows[0].sentAt, "sendEmail() resolved, so sent_at is set");
  });

  test("honeypot and too-fast submits are accepted silently and dropped", async () => {
    assert.equal((await sendContactMessage(undefined, form({ ...good, website: "http://spam" })))?.ok, true);
    assert.equal((await sendContactMessage(undefined, form({ ...good, startedAt: String(Date.now()) })))?.ok, true);
    assert.equal((await db.select().from(contactMessages)).length, 1, "nothing new stored");
  });

  test("validation errors are returned inline", async () => {
    assert.deepEqual(await sendContactMessage(undefined, form({ ...good, message: "" })), { error: "public.contact.form.errorRequired" });
    assert.deepEqual(await sendContactMessage(undefined, form({ ...good, email: "not-an-email" })), { error: "public.contact.form.errorEmail" });
    assert.equal((await db.select().from(contactMessages)).length, 1);
  });
});
