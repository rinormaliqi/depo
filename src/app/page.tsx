import Link from "next/link";
import { auth } from "@/auth";
import { logout } from "@/lib/actions/auth";

export default async function Home() {
  const session = await auth();

  return (
    <main style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: "0 24px", textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 26, letterSpacing: ".06em" }}>
        SMART<span style={{ color: "var(--color-accent)" }}>/</span>DEPO
      </div>
      <p className="text-muted">Digitize your storage. Find anything in seconds.</p>

      {session?.user ? (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <Link href="/builder" className="btn btn-primary">
            Open the blueprint
          </Link>
          <form action={async () => { "use server"; await logout(); }}>
            <button type="submit" className="btn btn-ghost" style={{ fontSize: 12 }}>
              Sign out ({session.user.email})
            </button>
          </form>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <Link href="/login" className="btn btn-secondary">
            Log in
          </Link>
          <Link href="/signup" className="btn btn-primary">
            Sign up
          </Link>
        </div>
      )}
    </main>
  );
}
