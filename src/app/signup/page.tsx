import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const session = await auth();
  if (session?.user) redirect("/builder");

  return (
    <main style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "0 24px" }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, textAlign: "center", marginBottom: 24 }}>Start your trial</div>
        <SignupForm />
        <p className="text-muted" style={{ marginTop: 16, textAlign: "center", fontSize: 13 }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "var(--color-accent)" }}>
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
