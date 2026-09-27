import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { matchesCustomFieldFilter } from "@/components/custom-field-filter";

// The one predicate behind every "narrow by a custom field" control
// (items, the scanner's item picker) — a UI detail, but the matching
// logic itself is pure and worth pinning down without a browser.
describe("matchesCustomFieldFilter", () => {
  test("no field selected matches everything", () => {
    assert.equal(matchesCustomFieldFilter("anything", undefined, "whatever"), true);
    assert.equal(matchesCustomFieldFilter(undefined, undefined, ""), true);
  });

  test("select/boolean fields match exactly, not by substring", () => {
    const select = { type: "select" as const };
    assert.equal(matchesCustomFieldFilter("Red", select, "Red"), true);
    assert.equal(matchesCustomFieldFilter("Redwood", select, "Red"), false, "a substring match would wrongly catch this");
    assert.equal(matchesCustomFieldFilter(undefined, select, "Red"), false);

    const boolean = { type: "boolean" as const };
    assert.equal(matchesCustomFieldFilter("true", boolean, "true"), true);
    assert.equal(matchesCustomFieldFilter("false", boolean, "true"), false);
  });

  test("text/number/date fields match case-insensitively by substring", () => {
    const text = { type: "text" as const };
    assert.equal(matchesCustomFieldFilter("Acme Corp", text, "acme"), true);
    assert.equal(matchesCustomFieldFilter("Acme Corp", text, "zenith"), false);
  });

  test("an empty filter value is a no-op — everything matches until something is typed", () => {
    const text = { type: "text" as const };
    assert.equal(matchesCustomFieldFilter(undefined, text, ""), true);
    assert.equal(matchesCustomFieldFilter("anything", text, "  "), true);
  });
});
