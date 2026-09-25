import assert from "node:assert/strict";
import { test } from "node:test";
import { CAPABILITIES, resolveCapabilities, type Capability, type PlanEntitlements } from "./capabilities";

const starter: PlanEntitlements = { key: "starter", name: "Starter", features: { printLabels: true, cameraScanning: true, viewMetrics: true }, maxUsers: 5, maxFacilities: 1, maxBins: 500, movementHistoryMonths: 12 };
const business: PlanEntitlements = { ...starter, key: "business", name: "Business", maxUsers: 20, maxFacilities: 3, maxBins: 5000, movementHistoryMonths: 24 };
const bare: PlanEntitlements = { ...starter, key: "bare", name: "Bare", features: { printLabels: false } };
const usage = { users: 1, facilities: 1, bins: 0 };

function expectCan(caps: ReturnType<typeof resolveCapabilities>, allowed: Capability[]) {
  for (const c of CAPABILITIES) assert.equal(caps.can[c], allowed.includes(c), `${caps.role}/${caps.plan.key}/${caps.locked}: ${c}`);
}

test("role decides actions; plan decides features; a worker never gets layout, team or billing", () => {
  const worker = resolveCapabilities({ role: "worker", plan: business, locked: null, usage });
  expectCan(worker, ["moveStock", "printLabels", "cameraScanning"]);
  assert.deepEqual(worker.reason.viewMetrics, { kind: "role" });
  assert.deepEqual(worker.reason.editLayout, { kind: "role" });
  assert.deepEqual(worker.reason.multiFacility, { kind: "role" });

  const manager = resolveCapabilities({ role: "manager", plan: business, locked: null, usage });
  expectCan(manager, ["moveStock", "editLayout", "manageItems", "manageTeam", "printLabels", "cameraScanning", "viewMetrics", "multiFacility"]);
  assert.deepEqual(manager.reason.manageBilling, { kind: "role" });

  const admin = resolveCapabilities({ role: "admin", plan: business, locked: null, usage });
  expectCan(admin, [...CAPABILITIES]);
});

test("an unconfigured (empty) feature map includes everything; a configured map is authoritative", () => {
  const legacy = resolveCapabilities({ role: "admin", plan: { ...starter, features: {} }, locked: null, usage });
  assert.equal(legacy.can.cameraScanning, true);
  assert.equal(legacy.can.printLabels, true);
  const configured = resolveCapabilities({ role: "admin", plan: { ...starter, features: { printLabels: true } }, locked: null, usage });
  assert.equal(configured.can.printLabels, true);
  assert.equal(configured.can.cameraScanning, false, "a missing key in a configured map is not included");
});

test("a plan without a feature switches it off for every role, with the plan as the reason", () => {
  const admin = resolveCapabilities({ role: "admin", plan: bare, locked: null, usage });
  assert.equal(admin.can.cameraScanning, false);
  assert.deepEqual(admin.reason.cameraScanning, { kind: "plan" });
  assert.equal(admin.can.editLayout, true, "actions are not plan features");
  // multiFacility follows the facilities limit, not a flag.
  assert.equal(resolveCapabilities({ role: "admin", plan: starter, locked: null, usage }).can.multiFacility, false);
  assert.equal(resolveCapabilities({ role: "admin", plan: business, locked: null, usage }).can.multiFacility, true);
  assert.equal(resolveCapabilities({ role: "admin", plan: { ...business, maxFacilities: null }, locked: null, usage }).can.multiFacility, true);
});

test("a locked org keeps read-side features, loses every action, and keeps the way to pay", () => {
  // Paying is how a lock is lifted, so billing survives it — otherwise the
  // lock seals the only door out of itself (#138).
  for (const lock of ["trialEnded", "expired", "pastDue", "canceled"] as const) {
    const caps = resolveCapabilities({ role: "admin", plan: business, locked: lock, usage });
    expectCan(caps, ["manageBilling", "printLabels", "cameraScanning", "viewMetrics", "multiFacility"]);
    assert.deepEqual(caps.reason.moveStock, { kind: "locked", lock });
    assert.equal(caps.reason.manageBilling, undefined, `${lock}: billing must stay open`);
  }

  // Before verification there is nothing to renew and the way out is the
  // verification link, not a payment, so billing stays shut with the rest.
  const unverified = resolveCapabilities({ role: "admin", plan: business, locked: "unverified", usage });
  expectCan(unverified, ["printLabels", "cameraScanning", "viewMetrics", "multiFacility"]);
  assert.deepEqual(unverified.reason.manageBilling, { kind: "locked", lock: "unverified" });

  // The exemption is about the lock, not about handing billing to anyone:
  // a manager never had it, locked or not.
  const manager = resolveCapabilities({ role: "manager", plan: business, locked: "trialEnded", usage });
  assert.deepEqual(manager.reason.manageBilling, { kind: "role" });

  // Role outranks lock in the explanation: a worker on a locked org is told
  // about their role for layout, not about billing they can't fix.
  const worker = resolveCapabilities({ role: "worker", plan: business, locked: "trialEnded", usage });
  assert.deepEqual(worker.reason.editLayout, { kind: "role" });
  assert.deepEqual(worker.reason.moveStock, { kind: "locked", lock: "trialEnded" });
});

test("limits carry usage and max, null max meaning unlimited", () => {
  const caps = resolveCapabilities({ role: "admin", plan: { ...business, maxBins: null }, locked: null, usage: { users: 4, facilities: 2, bins: 900 } });
  assert.deepEqual(caps.limits.users, { used: 4, max: 20 });
  assert.deepEqual(caps.limits.facilities, { used: 2, max: 3 });
  assert.deepEqual(caps.limits.bins, { used: 900, max: null });
  assert.equal(caps.limits.historyMonths, 24);
});
