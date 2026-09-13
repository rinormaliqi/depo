import { getChildren, getDemoFacility } from "./actions";
import { LocationBuilder } from "./location-builder";

export default async function BuilderPage() {
  const facility = await getDemoFacility();

  if (!facility) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6 text-center text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
        <p className="text-neutral-500">
          No facility yet — run <code>pnpm db:seed</code> to create the demo facility.
        </p>
      </main>
    );
  }

  const rootLocations = await getChildren(facility.id, null);

  return (
    <main className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <LocationBuilder
        facilityId={facility.id}
        facilityName={facility.name}
        initialLocations={rootLocations}
      />
    </main>
  );
}
