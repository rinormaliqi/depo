import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { cookies } from "next/headers";
import { GET as locate } from "@/app/builder/locate/route";
import { db } from "@/db";
import { facilities } from "@/db/schema";
import { facilityCookieName } from "@/lib/facilities";
import { addMember, createBin, createOrg } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";
import { resetCookies } from "@/test-support/stubs/next-headers";

// #215: search covers every facility of the company, so a result can be in
// a facility other than the one the map shows. /builder/locate switches to
// it and comes back to /builder?bin= so the bin is found and marked green.
describe("/builder/locate", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;
  let other: Awaited<ReturnType<typeof createOrg>>;
  let secondFacilityBin: Awaited<ReturnType<typeof createBin>>;
  let secondFacilityId: string;
  let otherOrgBin: Awaited<ReturnType<typeof createBin>>;

  before(async () => {
    resetCookies();
    await freshDatabase();
    org = await createOrg();
    other = await createOrg();
    const [second] = await db.insert(facilities).values({ organizationId: org.org.id, name: "Second" }).returning();
    secondFacilityId = second.id;
    secondFacilityBin = await createBin(second.id, "S-01");
    otherOrgBin = await createBin(other.facility.id, "X-01");
    actAs(await addMember(org.org.id, "worker"));
  });

  const call = (bin: string) => locate(new Request(`http://test.local/builder/locate?bin=${bin}`));

  test("switches to the bin's facility and returns to it on the map", async () => {
    const res = await call(secondFacilityBin.id);
    assert.equal(res.status, 307);
    const to = new URL(res.headers.get("location")!);
    assert.equal(to.pathname, "/builder");
    assert.equal(to.searchParams.get("bin"), secondFacilityBin.id);
    assert.equal(to.searchParams.get("switched"), "1");
    assert.equal((await cookies()).get(facilityCookieName)?.value, secondFacilityId);
  });

  test("another company's bin, or a malformed id, just opens the map", async () => {
    resetCookies();
    for (const bin of [otherOrgBin.id, "not-a-uuid"]) {
      const to = new URL((await call(bin)).headers.get("location")!);
      assert.equal(to.search, "");
    }
    assert.equal((await cookies()).get(facilityCookieName), undefined);
  });
});
