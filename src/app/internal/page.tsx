import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { listOrganizations } from "./actions";
import { InternalClient } from "./internal-client";

// Founder-only console for the manual-activation billing model (see
// docs/pricing.md and docs/architecture.md): turning a trialing org into a
// paying one today means a person — the founder — looks at this page after
// an offline conversation and picks a plan, not a customer clicking
// "upgrade" and a card getting charged. Cross-tenant by nature (lists every
// organization on the platform), so it deliberately does not reuse any of
// the org-scoped session helpers the rest of the app is built on, is never
// linked from the app's own nav, and stays English-only — it's operated by
// the founder, not shown to a customer, so translating it buys nothing.
export default async function InternalPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await isPlatformAdmin())) redirect("/builder");

  const { organizations, plans } = await listOrganizations();

  return (
    <div style={{ padding: 26, maxWidth: 960, margin: "0 auto" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, marginBottom: 4 }}>Platform admin</div>
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 20 }}>
        Manually activate or change an organization&apos;s plan. Not linked from anywhere in the app.
      </p>
      <InternalClient organizations={organizations} plans={plans} />
    </div>
  );
}
