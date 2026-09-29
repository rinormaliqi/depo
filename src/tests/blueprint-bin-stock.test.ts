import { freshDatabase } from "@/test-support/setup";
import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { eq } from "drizzle-orm";
import { getBlueprint } from "@/app/builder/actions";
import { db } from "@/db";
import { items } from "@/db/schema";
import { receiveStockAt } from "@/lib/stock";
import { addMember, createBin, createItem, createOrg } from "@/test-support/factories";
import { actAs } from "@/test-support/stubs/auth";
import { resetCookies } from "@/test-support/stubs/next-headers";

async function setMinStockLevel(itemId: string, min: number | null) {
  await db.update(items).set({ minStockLevel: min }).where(eq(items.id, itemId));
}

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

// Epic #2 (deferred half, PR #159): a bin is flagged "low stock" when an
// item it holds sits under its own minStockLevel — but low stock is a
// per-item, facility-wide question (a bin only ever sees part of the
// total), so the flag has to follow the item across every bin it's in.
describe("getBlueprint: low-stock flagging", () => {
  let org: Awaited<ReturnType<typeof createOrg>>;
  let worker: Awaited<ReturnType<typeof addMember>>;
  let low: Awaited<ReturnType<typeof createBin>>;
  let mixed: Awaited<ReturnType<typeof createBin>>;
  let plentiful: Awaited<ReturnType<typeof createBin>>;
  let unset: Awaited<ReturnType<typeof createBin>>;
  let bolt: Awaited<ReturnType<typeof createItem>>;
  let washer: Awaited<ReturnType<typeof createItem>>;
  let nail: Awaited<ReturnType<typeof createItem>>;

  before(async () => {
    resetCookies();
    await freshDatabase();
    org = await createOrg();
    worker = await addMember(org.org.id, "worker");
    low = await createBin(org.facility.id, "B-01-1");
    mixed = await createBin(org.facility.id, "B-01-2");
    plentiful = await createBin(org.facility.id, "B-01-3");
    unset = await createBin(org.facility.id, "B-01-4");
    bolt = await createItem(org.org.id, "Bolt");
    washer = await createItem(org.org.id, "Washer");
    nail = await createItem(org.org.id, "Nail");
    actAs(worker);

    await setMinStockLevel(bolt.id, 50);
    await setMinStockLevel(washer.id, 10);
    // `nail` keeps its default null threshold — never flagged.

    // bolt: split across two bins, facility total 8 < 50 → flagged everywhere it appears.
    await receiveStockAt(org.org.id, worker.id, low.id, bolt.id, 5);
    await receiveStockAt(org.org.id, worker.id, mixed.id, bolt.id, 3);
    // washer: sits alongside bolt in `mixed`, total 20 >= 10 → not flagged.
    await receiveStockAt(org.org.id, worker.id, mixed.id, washer.id, 20);
    // nail: plenty of stock but no threshold set → never flagged.
    await receiveStockAt(org.org.id, worker.id, plentiful.id, nail.id, 1);
    // `unset` never receives anything.
  });

  test("lowStockBinIds lists every bin holding an under-threshold item, and no others", async () => {
    const data = await getBlueprint(org.facility.id);
    const flagged = new Set(data.lowStockBinIds);
    assert.ok(flagged.has(low.id), "bolt's bin");
    assert.ok(flagged.has(mixed.id), "bolt is also here, even though washer in the same bin is fine");
    assert.ok(!flagged.has(plentiful.id), "nail has no threshold");
    assert.ok(!flagged.has(unset.id), "empty bin");
  });

  test("binStock marks belowMinimum per item, not per bin", async () => {
    const data = await getBlueprint(org.facility.id);
    const byId = new Map(data.binStock.map((b) => [b.locationId, b]));

    const mixedEntry = byId.get(mixed.id);
    assert.ok(mixedEntry);
    const boltRow = mixedEntry.items.find((i) => i.itemId === bolt.id);
    const washerRow = mixedEntry.items.find((i) => i.itemId === washer.id);
    assert.equal(boltRow?.belowMinimum, true);
    assert.equal(washerRow?.belowMinimum, false);

    const plentifulEntry = byId.get(plentiful.id);
    assert.ok(plentifulEntry);
    assert.equal(plentifulEntry.items.find((i) => i.itemId === nail.id)?.belowMinimum, false);
  });

  test("a threshold met exactly is not flagged", async () => {
    await setMinStockLevel(washer.id, 20);
    const data = await getBlueprint(org.facility.id);
    const mixedEntry = data.binStock.find((b) => b.locationId === mixed.id);
    assert.equal(mixedEntry?.items.find((i) => i.itemId === washer.id)?.belowMinimum, false);
    await setMinStockLevel(washer.id, 10);
  });
});
