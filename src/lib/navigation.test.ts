import assert from "node:assert/strict";
import { test } from "node:test";
import { homeFor, primaryNav, secondaryNav } from "./navigation";

const can = (over: Record<string, boolean>) => ({
  moveStock: true, editLayout: true, manageItems: true, manageTeam: true, manageBilling: true,
  printLabels: true, cameraScanning: true, viewMetrics: true, multiFacility: true, ...over,
});

test("workers see find / scan / labels / map and nothing to manage", () => {
  const caps = { role: "worker" as const, can: can({ editLayout: false, manageItems: false, manageTeam: false, manageBilling: false, multiFacility: false }) };
  assert.deepEqual(primaryNav(caps).map((n) => n.key), ["find", "scanner", "labels", "blueprint"]);
  assert.deepEqual(secondaryNav(caps), []);
  assert.equal(homeFor("worker"), "/stock");
});

test("managers get the depot, admins add billing; a plan without metrics drops the tab", () => {
  const manager = { role: "manager" as const, can: can({ manageBilling: false }) };
  assert.deepEqual(primaryNav(manager).map((n) => n.key), ["blueprint", "stock", "metrics", "scanner"]);
  assert.deepEqual(secondaryNav(manager).map((n) => n.key), ["items", "team"]);
  const admin = { role: "admin" as const, can: can({}) };
  assert.deepEqual(secondaryNav(admin).map((n) => n.key), ["items", "team", "billing"]);
  assert.deepEqual(primaryNav({ role: "admin", can: can({ viewMetrics: false }) }).map((n) => n.key), ["blueprint", "stock", "scanner"]);
  assert.equal(homeFor("admin"), "/builder");
});
