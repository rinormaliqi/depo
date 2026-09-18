import Link from "next/link";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { PublicFooter } from "@/components/public-page";

// Shell for the auth forms (login, signup, forgot/reset password, invite):
// the wordmark linking home and the language switch above, the same
// footer as every other public page below, the form centered between.
// Slimmer than PublicHeader on purpose — no "Start free trial" button on
// the page where you're already doing that.
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px" }}>
        <Link href="/" style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 19, letterSpacing: ".06em", color: "var(--color-text)", textDecoration: "none" }}>
          SMART<span style={{ color: "var(--color-accent)" }}>/</span>DEPO
        </Link>
        <LocaleSwitcher />
      </header>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "24px 24px 48px" }}>
        {children}
      </div>
      <PublicFooter />
    </main>
  );
}
