import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { contentSecurityPolicy, securityHeaders } from "@/lib/security-headers";

function directives(csp: string) {
  return new Map(csp.split("; ").map((d) => {
    const [name, ...values] = d.split(" ");
    return [name, values] as const;
  }));
}

// #194: the headers securityheaders.com grades, and the few things the
// policy must keep allowing or the app breaks — the scanner's camera, the
// Google and Paysera redirects, Google Fonts, the underlay's blob: preview.
describe("security headers", () => {
  const prod = new Map(securityHeaders({ dev: false }).map((h) => [h.key, h.value]));

  test("every graded header is sent", () => {
    for (const key of ["Content-Security-Policy", "Strict-Transport-Security", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]) {
      assert.ok(prod.get(key), `${key} missing`);
    }
    assert.equal(prod.get("X-Frame-Options"), "DENY");
    assert.equal(prod.get("X-Content-Type-Options"), "nosniff");
    assert.match(prod.get("Strict-Transport-Security")!, /max-age=\d{8,}/);
  });

  test("nothing can frame the app, and it frames nothing", () => {
    const d = directives(contentSecurityPolicy({ dev: false }));
    assert.deepEqual(d.get("frame-ancestors"), ["'none'"]);
    assert.deepEqual(d.get("frame-src"), ["'none'"]);
    assert.deepEqual(d.get("object-src"), ["'none'"]);
    assert.deepEqual(d.get("base-uri"), ["'self'"]);
  });

  test("what the app needs stays allowed", () => {
    const d = directives(contentSecurityPolicy({ dev: false }));
    assert.ok(d.get("form-action")!.includes("https://accounts.google.com"), "Google sign-in redirect");
    assert.ok(d.get("form-action")!.includes("https://bank.paysera.com"), "Paysera redirect");
    assert.ok(d.get("style-src")!.includes("https://fonts.googleapis.com"));
    assert.ok(d.get("font-src")!.includes("https://fonts.gstatic.com"));
    assert.ok(d.get("img-src")!.includes("blob:"), "underlay preview");
    assert.match(prod.get("Permissions-Policy")!, /camera=\(self\)/, "scanner camera");
  });

  test("production is strict about what dev needs", () => {
    const p = contentSecurityPolicy({ dev: false });
    const dev = contentSecurityPolicy({ dev: true });
    assert.ok(!p.includes("'unsafe-eval'"));
    assert.ok(dev.includes("'unsafe-eval'"));
    assert.ok(p.includes("upgrade-insecure-requests"));
    assert.ok(!dev.includes("upgrade-insecure-requests"), "plain-http localhost must keep working");
  });
});
