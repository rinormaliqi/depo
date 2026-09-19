import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// Every notification goes through src/components/notifications — the
// browser's own alert/confirm/prompt are off-limits (they look nothing
// like the product, can't be styled, and block the tab). This fails the
// suite if one sneaks back in.
function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (/\.(tsx?|mjs)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(path);
  }
  return out;
}

test("no window.alert / confirm / prompt in src/", () => {
  const offenders = walk(join(process.cwd(), "src")).filter((f) => /\b(window\.)?(alert|confirm|prompt)\(/.test(readFileSync(f, "utf8").replace(/\/\/.*$/gm, "").replace(/useConfirm\(\)|confirm\(\{|confirm\(opts/g, "")));
  assert.deepEqual(offenders, [], `use useNotify()/useConfirm() instead of browser dialogs in: ${offenders.join(", ")}`);
});
