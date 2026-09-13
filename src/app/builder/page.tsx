import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { getChildren, getMyFacility } from "./actions";
import { LocationBuilder } from "./location-builder";

export default async function BuilderPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const facility = await getMyFacility();

  if (!facility) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6 text-center text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <p className="text-neutral-500">No facility found for your organization yet.</p>
      </main>
    );
  }

  const rootLocations = await getChildren(facility.id, null);

  return (
    <main className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-6">
        <span className="text-xs text-neutral-400">{session.user.email}</span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            Sign out
          </button>
        </form>
      </div>
      <LocationBuilder
        facilityId={facility.id}
        facilityName={facility.name}
        initialLocations={rootLocations}
      />
    </main>
  );
}
