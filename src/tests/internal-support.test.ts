import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { listAuditLog } from "@/app/internal/actions";
import { listContactMessages, markContactMessageHandled } from "@/app/internal/support-actions";
import { db } from "@/db";
import { contactMessages } from "@/db/schema";
import { createUser } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";

describe("internal: contact messages inbox", () => {
  let admin: Awaited<ReturnType<typeof createUser>>;
  let previousAllowlist: string | undefined;

  before(async () => {
    await freshDatabase();
    admin = await createUser({ email: "founder@smartdepo.test", normalizedEmail: "founder@smartdepo.test" });
    previousAllowlist = process.env.PLATFORM_ADMIN_EMAILS;
    process.env.PLATFORM_ADMIN_EMAILS = admin.email;
    actAs(admin);
  });

  after(() => {
    process.env.PLATFORM_ADMIN_EMAILS = previousAllowlist;
  });

  test("listContactMessages returns newest first", async () => {
    const [older] = await db.insert(contactMessages).values({ name: "A", email: "a@example.com", message: "hi" }).returning();
    await new Promise((r) => setTimeout(r, 5));
    const [newer] = await db.insert(contactMessages).values({ name: "B", email: "b@example.com", message: "hello" }).returning();

    const list = await listContactMessages();
    const iOlder = list.findIndex((m) => m.id === older.id);
    const iNewer = list.findIndex((m) => m.id === newer.id);
    assert.ok(iNewer < iOlder, "newest first");
  });

  test("markContactMessageHandled sets handledAt and logs it", async () => {
    const [msg] = await db.insert(contactMessages).values({ name: "C", email: "c@example.com", message: "help" }).returning();
    assert.equal(msg.handledAt, null);

    const result = await markContactMessageHandled(msg.id);
    assert.ok(result.ok);
    const [after] = await db.select().from(contactMessages).where(eq(contactMessages.id, msg.id));
    assert.ok(after.handledAt);

    const entries = await listAuditLog();
    assert.ok(entries.find((e) => e.action === "support.message.handled" && e.targetId === msg.id));
  });

  test("markContactMessageHandled refuses a non-admin", async () => {
    const [msg] = await db.insert(contactMessages).values({ name: "D", email: "d@example.com", message: "hey" }).returning();
    const outsider = await createUser({ email: "not-admin@example.com", normalizedEmail: "not-admin@example.com" });
    actAs(outsider);
    const result = await markContactMessageHandled(msg.id);
    assert.equal(result.ok, false);
    const [row] = await db.select().from(contactMessages).where(eq(contactMessages.id, msg.id));
    assert.equal(row.handledAt, null);
    actAs(admin);
  });
});
