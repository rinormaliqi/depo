import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/builder");

  return (
    <main style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: "0 24px" }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontFamily: "var(--font-heading)", fontSize: 20, textAlign: "center", marginBottom: 24 }}>Log in</div>
        <LoginForm />
        <p className="text-muted" style={{ marginTop: 16, textAlign: "center", fontSize: 13 }}>
          Don&apos;t have an account?{" "}
          <Link href="/signup" style={{ color: "var(--color-accent)" }}>
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
