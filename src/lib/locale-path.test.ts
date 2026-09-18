import assert from "node:assert/strict";
import { test } from "node:test";
import { localizedPath, splitLocale } from "./locale-path";

test("splitLocale recognises only a non-default, known locale prefix", () => {
  assert.deepEqual(splitLocale("/en"), { locale: "en", path: "/" });
  assert.deepEqual(splitLocale("/en/pricing"), { locale: "en", path: "/pricing" });
  assert.deepEqual(splitLocale("/pricing"), { locale: null, path: "/pricing" });
  assert.deepEqual(splitLocale("/sq/pricing"), { locale: null, path: "/sq/pricing" }, "the default locale has no prefix");
  assert.deepEqual(splitLocale("/english"), { locale: null, path: "/english" });
  assert.deepEqual(splitLocale("/de/pricing"), { locale: null, path: "/de/pricing" });
});

test("localizedPath round-trips with splitLocale", () => {
  assert.equal(localizedPath("sq", "/pricing"), "/pricing");
  assert.equal(localizedPath("en", "/pricing"), "/en/pricing");
  assert.equal(localizedPath("en", "/"), "/en");
  assert.equal(localizedPath("sq", "/"), "/");
  for (const [l, p] of [["en", "/"], ["en", "/terms"], ["sq", "/contact"]] as const) {
    const built = localizedPath(l, p);
    const back = splitLocale(built);
    assert.equal(back.path, p);
    assert.equal(back.locale ?? "sq", l);
  }
});
