import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { emailChanges, memberships, organizations, users } from "@/db/schema";
import { changePassword, confirmEmailChange, deleteAccount, requestEmailChange, signOutEverywhere, updateName } from "@/lib/account";
import { getMySession } from "@/lib/session";
import { addMember, createOrg, createUser, seedPlans } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";

describe("account settings", () => {
  before(async () => {
    await freshDatabase();
    await seedPlans();
  });

  test("name and password: a password user proves the current one, a Google-only user just sets", async () => {
    const u = await createUser({ passwordHash: null });
    await updateName(u.id, "  Agron K  ");
    assert.equal((await db.select().from(users).where(eq(users.id, u.id)))[0].name, "Agron K");
    await assert.rejects(updateName(u.id, "  "), /nameRequired/);

    await changePassword(u.id, undefined, "first-pass-1");
    const [after] = await db.select().from(users).where(eq(users.id, u.id));
    assert.ok(await compare("first-pass-1", after.passwordHash!));
    await assert.rejects(changePassword(u.id, "wrong", "second-pass-2"), /wrongCurrentPassword/);
    await assert.rejects(changePassword(u.id, "first-pass-1", "short"), /passwordLength/);
    await changePassword(u.id, "first-pass-1", "second-pass-2");
    assert.ok(await compare("second-pass-2", (await db.select().from(users).where(eq(users.id, u.id)))[0].passwordHash!));
  });

  test("email change takes effect only when the new inbox confirms; uniqueness is rechecked", async () => {
    const u = await createUser({ email: "old@example.com", normalizedEmail: "old@example.com" });
    await createUser({ email: "taken@example.com", normalizedEmail: "taken@example.com" });
    await assert.rejects(requestEmailChange(u.id, "taken@example.com"), /emailTaken/);
    await assert.rejects(requestEmailChange(u.id, "old@example.com"), /emailSame/);
    await assert.rejects(requestEmailChange(u.id, "x@mailinator.com"), /emailDisposable/);

    await requestEmailChange(u.id, "New.Addr@Example.com");
    assert.equal((await db.select().from(users).where(eq(users.id, u.id)))[0].email, "old@example.com", "unchanged until confirmed");
    const [pending] = await db.select().from(emailChanges).where(eq(emailChanges.userId, u.id));
    assert.equal(pending.newEmail, "new.addr@example.com");

    // A second request supersedes the first.
    await requestEmailChange(u.id, "newer@example.com");
    assert.deepEqual(await confirmEmailChange(pending.token), { ok: false, reason: "used" });
    const [live] = await db.select().from(emailChanges).where(eq(emailChanges.userId, u.id)).then((r) => r.filter((x) => !x.usedAt));
    // Someone grabs the address before the click.
    await createUser({ email: "newer@example.com", normalizedEmail: "newer@example.com" });
    assert.deepEqual(await confirmEmailChange(live.token), { ok: false, reason: "taken" });

    await requestEmailChange(u.id, "final@example.com");
    const [tok] = (await db.select().from(emailChanges).where(eq(emailChanges.userId, u.id))).filter((x) => !x.usedAt);
    assert.deepEqual(await confirmEmailChange(tok.token), { ok: true, email: "final@example.com" });
    const [done] = await db.select().from(users).where(eq(users.id, u.id));
    assert.equal(done.email, "final@example.com");
    assert.ok(done.emailVerifiedAt);
    assert.deepEqual(await confirmEmailChange(tok.token), { ok: false, reason: "used" });
    assert.deepEqual(await confirmEmailChange("nope"), { ok: false, reason: "unknown" });
  });

  test("sign out everywhere refuses tokens minted before the bump", async () => {
    const { org } = await createOrg();
    const u = await addMember(org.id, "admin");
    actAs({ ...u, sessionVersion: 1 } as never);
    assert.ok(await getMySession());
    await signOutEverywhere(u.id);
    assert.equal(await getMySession(), null, "old session version → signed out");
    actAs({ ...u, sessionVersion: 2 } as never);
    assert.ok(await getMySession(), "a fresh sign-in carries the new version");
  });

  test("deleting an account erases the person, deletes sole-member companies, and refuses the only admin of a shared one", async () => {
    const { org: shared } = await createOrg();
    const me = await addMember(shared.id, "admin");
    await addMember(shared.id, "worker");
    await assert.rejects(deleteAccount(me.id), /lastAdminOf/);

    const other = await addMember(shared.id, "admin");
    const { org: solo } = await createOrg();
    await addMember(solo.id, "admin", me);
    await deleteAccount(me.id);

    assert.equal((await db.select().from(organizations).where(eq(organizations.id, solo.id))).length, 0, "sole-member company deleted");
    assert.equal((await db.select().from(organizations).where(eq(organizations.id, shared.id))).length, 1, "shared company kept");
    assert.equal((await db.select().from(memberships).where(eq(memberships.userId, me.id))).length, 0);
    const [scrubbed] = await db.select().from(users).where(eq(users.id, me.id));
    assert.match(scrubbed.email, /^deleted-.*@deleted\.invalid$/);
    assert.equal(scrubbed.passwordHash, null);
    assert.equal((await db.select().from(memberships).where(eq(memberships.userId, other.id))).length, 1);
  });
});
