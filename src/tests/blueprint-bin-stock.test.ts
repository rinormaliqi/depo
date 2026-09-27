import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { getBlueprint } from "@/app/builder/actions";
import { receiveStockAt } from "@/lib/stock";
import { addMember, createBin, createItem, createOrg } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";
import { resetCookies } from "@/test-support/stubs/next-headers";

// Epic #2: the blueprint shades a bin by how full it is and shows its
// contents on hover, which needs getBlueprint to carry per-bin quantities
// and item breakdowns, not just a flat "has stock" set.
describe("getBlueprint: per-bin stock", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;
  let worker: Awaited<ReturnType<typeof addMember>>;
  let full: Awaited<ReturnType<typeof createBin>>;
  let light: Awaited<ReturnType<typeof createBin>>;
  let bare: Awaited<ReturnType<typeof createBin>>;
  let cable: Awaited<ReturnType<typeof createItem>>;
  let lamp: Awaited<ReturnType<typeof createItem>>;

  before(async () => {
    resetCookies();
    await freshDatabase();
    org = await createOrg();
    worker = await addMember(org.org.id, "worker");
    full = await createBin(org.facility.id, "A-01-1");
    light = await createBin(org.facility.id, "A-01-2");
    bare = await createBin(org.facility.id, "A-01-3");
    cable = await createItem(org.org.id, "Cable");
    lamp = await createItem(org.org.id, "Lamp");
    actAs(worker);

    await receiveStockAt(org.org.id, worker.id, full.id, cable.id, 80);
    await receiveStockAt(org.org.id, worker.id, full.id, lamp.id, 20);
    await receiveStockAt(org.org.id, worker.id, light.id, cable.id, 5);
    // `bare` gets nothing — it should be absent from binStock entirely.
  });

  test("occupiedBinIds only lists bins that actually have stock", async () => {
    const data = await getBlueprint(org.facility.id);
    const occupied = new Set(data.occupiedBinIds);
    assert.ok(occupied.has(full.id));
    assert.ok(occupied.has(light.id));
    assert.ok(!occupied.has(bare.id));
  });

  test("binStock sums quantity per bin and lists every item in it", async () => {
    const data = await getBlueprint(org.facility.id);
    const byId = new Map(data.binStock.map((b) => [b.locationId, b]));

    const fullEntry = byId.get(full.id);
    assert.ok(fullEntry);
    assert.equal(fullEntry.totalQuantity, 100);
    const names = fullEntry.items.map((i) => i.name).sort();
    assert.deepEqual(names, ["Cable", "Lamp"]);

    const lightEntry = byId.get(light.id);
    assert.ok(lightEntry);
    assert.equal(lightEntry.totalQuantity, 5);

    assert.equal(byId.has(bare.id), false);
  });
});
