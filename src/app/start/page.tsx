import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getMySession } from "@/lib/session";
import { homeFor } from "@/lib/navigation";

// Where every sign-in lands: routes by role (workers to "find", the rest
// to the blueprint), and sends a session with no organization yet to
// /welcome. Exists so login, invites and Google can all redirect to one
// place without knowing the role up front.
export default async function StartPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const me = await getMySession();
  if (!me) redirect("/welcome");
  redirect(homeFor(me.role));
}
