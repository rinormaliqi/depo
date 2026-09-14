import { auth } from "@/auth";

// A handful of hardcoded operator emails, not a real role — this is a
// single-founder product with exactly one person who should ever see cross-
// tenant billing data. A DB-level "platform admin" role/table is premature
// generalization for that; an env var allowlist is enough until it isn't.
function allowlist() {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function isPlatformAdmin() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return false;
  return allowlist().includes(email);
}

export async function requirePlatformAdmin() {
  if (!(await isPlatformAdmin())) {
    throw new Error("Not authorized");
  }
}
