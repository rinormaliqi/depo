"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/auth";
import { attempt } from "@/lib/action-result";
import * as account from "@/lib/account";
import { LIMITS, assertNotLimited, record } from "@/lib/rate-limit";
import { UserError } from "@/lib/user-error";

async function me() {
  const session = await auth();
  if (!session?.user?.id) throw new UserError("Not signed in");
  return session.user;
}

export async function updateName(name: string) {
  return attempt(async () => {
    const user = await me();
    await account.updateName(user.id, name);
    revalidatePath("/", "layout");
  }, "updateName");
}

export async function changePassword(current: string | undefined, next: string) {
  return attempt(async () => {
    const user = await me();
    await account.changePassword(user.id, current, next);
  }, "changePassword");
}

// Rate-limited like the other mailers: a confirmation link per address
// change, a few per hour.
export async function requestEmailChange(email: string) {
  return attempt(async () => {
    const user = await me();
    const key = `email-change:user:${user.id}`;
    await assertNotLimited(key, LIMITS.emailChange);
    const result = await account.requestEmailChange(user.id, email);
    await record(key);
    return result;
  }, "requestEmailChange");
}

export async function signOutEverywhere() {
  const user = await me();
  await account.signOutEverywhere(user.id);
  await signOut({ redirectTo: "/login" });
}

export async function deleteAccount() {
  const user = await me();
  try {
    await account.deleteAccount(user.id);
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
  await signOut({ redirectTo: "/" });
  redirect("/");
}
