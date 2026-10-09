import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { getLabelBins } from "@/app/labels/actions";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { addMember, createBin, createOrg } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";
import { resetCookies } from "@/test-support/stubs/next-headers";

// #207: a big floor is printed one page or one zone at a time, so the
// facility-wide label list also says how many labels each zone holds.
describe("getLabelBins: zones to print one at a time", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;
  let zoneA: typeof locations.$inferSelect;
  let zoneB: typeof locations.$inferSelect;

  before(async () => {
    resetCookies();
    await freshDatabase();
    org = await createOrg();
    const admin = await addMember(org.org.id, "admin");
    [zoneA] = await db.insert(locations).values({ facilityId: org.facility.id, kind: "zone", name: "Hyrja", code: "A" }).returning();
    [zoneB] = await db.insert(locations).values({ facilityId: org.facility.id, kind: "zone", name: "Dalja", code: "B" }).returning();
    // Two bins under a rack in zone A, one straight in zone B, one in no zone.
    const [rack] = await db.insert(locations).values({ facilityId: org.facility.id, parentId: zoneA.id, kind: "rack", name: "RAFT", code: "A-R1", bays: 2 }).returning();
    await db.insert(locations).values([
      { facilityId: org.facility.id, parentId: rack.id, kind: "bin", name: "BIN", code: "A-R1-1", isBin: true },
      { facilityId: org.facility.id, parentId: rack.id, kind: "bin", name: "BIN", code: "A-R1-2", isBin: true },
      { facilityId: org.facility.id, parentId: zoneB.id, kind: "bin", name: "BIN", code: "B-1", isBin: true },
    ]);
    await createBin(org.facility.id, "LOOSE-1");
    actAs(admin);
  });

  test("the whole facility lists each zone with its bin count, nearest zone wins", async () => {
    const { bins, zones } = await getLabelBins({ kind: "facility" });
    assert.equal(bins.length, 4);
    assert.deepEqual(
      zones.map((z) => [z.id, z.label, z.count]),
      [
        [zoneA.id, "A · Hyrja", 2],
        [zoneB.id, "B · Dalja", 1],
      ],
    );
  });

  test("a zone's own labels carry no zone list", async () => {
    const { bins, zones } = await getLabelBins({ kind: "parent", parentId: zoneA.id });
    assert.equal(bins.length, 2);
    assert.deepEqual(zones, []);
  });
});
