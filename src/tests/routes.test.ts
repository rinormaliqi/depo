import assert from "node:assert/strict";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { protectedPrefixes, publicPaths, publicPrefixes, routeAccess } from "@/lib/routes";

const appDir = join(process.cwd(), "src", "app");

function hasPage(dir: string): boolean {
  if (existsSync(join(dir, "page.tsx")) || existsSync(join(dir, "route.ts"))) return true;
  return readdirSync(dir, { withFileTypes: true }).some((d) => d.isDirectory() && hasPage(join(dir, d.name)));
}

test("every top-level route under src/app is either public or protected — never unknown", () => {
  const dirs = readdirSync(appDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && hasPage(join(appDir, d.name)))
    .map((d) => `/${d.name}`);
  const unclassified = dirs.filter((path) => {
    if (publicPaths.has(path)) return false;
    if (publicPrefixes.some((p) => path.startsWith(p.replace(/\/$/, "")))) return false;
    if (protectedPrefixes.includes(path)) return false;
    // /api/* is classified per sub-route: each directory under it must be a
    // public prefix (auth, Paysera) or a protected one (builder's underlay).
    if (path === "/api") {
      return readdirSync(join(appDir, "api")).some((n) => {
        const sub = `/api/${n}`;
        return !publicPrefixes.some((p) => p.startsWith(sub)) && !protectedPrefixes.includes(sub);
      });
    }
    return true;
  });
  assert.deepEqual(unclassified, [], `add these to src/lib/routes.ts: ${unclassified.join(", ")}`);
});

test("routeAccess classifies the cases the middleware relies on", () => {
  assert.equal(routeAccess("/"), "public");
  assert.equal(routeAccess("/robots.txt"), "public");
  assert.equal(routeAccess("/invite/abc"), "public");
  assert.equal(routeAccess("/api/auth/session"), "public");
  assert.equal(routeAccess("/api/builder/underlay/abc"), "protected");
  assert.equal(routeAccess("/builder"), "protected");
  assert.equal(routeAccess("/builder/bin/123"), "protected");
  assert.equal(routeAccess("/builderx"), "unknown");
  assert.equal(routeAccess("/nuk-ekziston"), "unknown");
});
