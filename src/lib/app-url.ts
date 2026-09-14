import { headers } from "next/headers";

// Base URL for links that go out in emails (verification, reset, invites).
// Derived from the incoming request's host rather than an env var so a
// preview deploy or a LAN-IP dev session links back to itself — there is
// no APP_URL to keep in sync per environment.
export async function appBaseUrl(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}`;
}
