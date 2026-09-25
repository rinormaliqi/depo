# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: imports.spec.ts >> stock import >> a quantity written 3.0 stays 3 instead of becoming 30
- Location: e2e/imports.spec.ts:98:3

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: locator('body')
Timeout: 10000ms
Expected pattern: /\b3 njësi\b/
Received string:  "SMART/DEPODepo Fushë KosovëDepo Graçanicë+ Shto objekt…40.0 × 24.0 m · metrikBusiness⋯SkemaStokuMetrikaSkaneriArtikujtEkipiFaturimiLlogariaSQENblerim@seed.smartdepo.testDilniSkemaStokuMetrikaSkaneriImporto stokun — Depo Fushë KosovëInventarizimi si listë: cili artikull, në cilën kuti, sa. Ngjit nga Excel ose hap një CSV. Kolonat: artikulli (SKU, ose emri i saktë nëse artikulli s'ka SKU), vendndodhja (kodi i kutisë në etiketë, p.sh. A-03-2-4), sasia. Çdo rresht bëhet një hyrje në atë kuti të këtij objekti, mbi atë që ka.Hap një skedar CSV…Shkarko CSV shembullKthehu te stokuartikulli;kutia;sasia·
NDR-0001;D-01-1-1;3.0KontrolloImporto 1 rreshta1 rreshta · 1 kuti · 30 njësi · 0 gabimeRreshti i titujve u njohRreshtat e parë siç do të hyjnëartikullivendndodhjasasiaNDR-0001D-01-1-130"

Call log:
  - Expect "toContainText" locator('body') with timeout 10000ms
  - waiting for locator('body')
    2 × locator resolved to <body>…</body>
      - unexpected value "SMART/DEPODepo Fushë Kosovë40.0 × 24.0 m · metrik⋯SkemaStokuMetrikaSkaneriArtikujtEkipiFaturimiLlogariaSQENblerim@seed.smartdepo.testDilniSkemaStokuMetrikaSkaneriImporto stokun — Depo Fushë KosovëInventarizimi si listë: cili artikull, në cilën kuti, sa. Ngjit nga Excel ose hap një CSV. Kolonat: artikulli (SKU, ose emri i saktë nëse artikulli s'ka SKU), vendndodhja (kodi i kutisë në etiketë, p.sh. A-03-2-4), sasia. Çdo rresht bëhet një hyrje në atë kuti të këtij objekti, mbi atë që ka.Hap një skedar CSV…Shkarko CSV shembullKthehu te stokuartikulli;kutia;sasia
NDR-0001;D-01-1-1;3.0Duke kontrolluar…"
    2 × locator resolved to <body>…</body>
      - unexpected value "SMART/DEPODepo Fushë KosovëDepo Graçanicë+ Shto objekt…40.0 × 24.0 m · metrik⋯SkemaStokuMetrikaSkaneriArtikujtEkipiFaturimiLlogariaSQENblerim@seed.smartdepo.testDilniSkemaStokuMetrikaSkaneriImporto stokun — Depo Fushë KosovëInventarizimi si listë: cili artikull, në cilën kuti, sa. Ngjit nga Excel ose hap një CSV. Kolonat: artikulli (SKU, ose emri i saktë nëse artikulli s'ka SKU), vendndodhja (kodi i kutisë në etiketë, p.sh. A-03-2-4), sasia. Çdo rresht bëhet një hyrje në atë kuti të këtij objekti, mbi atë që ka.Hap një skedar CSV…Shkarko CSV shembullKthehu te stokuartikulli;kutia;sasia
NDR-0001;D-01-1-1;3.0Duke kontrolluar…"
    - locator resolved to <body>…</body>
    - unexpected value "SMART/DEPODepo Fushë KosovëDepo Graçanicë+ Shto objekt…40.0 × 24.0 m · metrikBusiness⋯SkemaStokuMetrikaSkaneriArtikujtEkipiFaturimiLlogariaSQENblerim@seed.smartdepo.testDilniSkemaStokuMetrikaSkaneriImporto stokun — Depo Fushë KosovëInventarizimi si listë: cili artikull, në cilën kuti, sa. Ngjit nga Excel ose hap një CSV. Kolonat: artikulli (SKU, ose emri i saktë nëse artikulli s'ka SKU), vendndodhja (kodi i kutisë në etiketë, p.sh. A-03-2-4), sasia. Çdo rresht bëhet një hyrje në atë kuti të këtij objekti, mbi atë që ka.Hap një skedar CSV…Shkarko CSV shembullKthehu te stokuartikulli;kutia;sasia
NDR-0001;D-01-1-1;3.0Duke kontrolluar…"
    19 × locator resolved to <body>…</body>
       - unexpected value "SMART/DEPODepo Fushë KosovëDepo Graçanicë+ Shto objekt…40.0 × 24.0 m · metrikBusiness⋯SkemaStokuMetrikaSkaneriArtikujtEkipiFaturimiLlogariaSQENblerim@seed.smartdepo.testDilniSkemaStokuMetrikaSkaneriImporto stokun — Depo Fushë KosovëInventarizimi si listë: cili artikull, në cilën kuti, sa. Ngjit nga Excel ose hap një CSV. Kolonat: artikulli (SKU, ose emri i saktë nëse artikulli s'ka SKU), vendndodhja (kodi i kutisë në etiketë, p.sh. A-03-2-4), sasia. Çdo rresht bëhet një hyrje në atë kuti të këtij objekti, mbi atë që ka.Hap një skedar CSV…Shkarko CSV shembullKthehu te stokuartikulli;kutia;sasia
NDR-0001;D-01-1-1;3.0KontrolloImporto 1 rreshta1 rreshta · 1 kuti · 30 njësi · 0 gabimeRreshti i titujve u njohRreshtat e parë siç do të hyjnëartikullivendndodhjasasiaNDR-0001D-01-1-130"

```

```yaml
- link "SMART/DEPO":
  - /url: /builder
- combobox "Ndërro objektin":
  - option "Depo Fushë Kosovë" [selected]
  - option "Depo Graçanicë"
  - option "+ Shto objekt…"
- text: 40.0 × 24.0 m · metrik
- link "Business":
  - /url: /billing
- link "Skema":
  - /url: /builder
- link "Stoku":
  - /url: /stock
- link "Metrika":
  - /url: /metrics
- link "Skaneri":
  - /url: /scanner
- searchbox "Kërko një artikull, SKU ose vendndodhje"
- link "Artikujt":
  - /url: /items
- link "Ekipi":
  - /url: /team
- link "Faturimi":
  - /url: /billing
- link "Llogaria":
  - /url: /account
- button "SQ"
- button "EN"
- text: blerim@seed.smartdepo.test
- button "Dilni"
- text: Importo stokun — Depo Fushë Kosovë
- paragraph: "Inventarizimi si listë: cili artikull, në cilën kuti, sa. Ngjit nga Excel ose hap një CSV. Kolonat: artikulli (SKU, ose emri i saktë nëse artikulli s'ka SKU), vendndodhja (kodi i kutisë në etiketë, p.sh. A-03-2-4), sasia. Çdo rresht bëhet një hyrje në atë kuti të këtij objekti, mbi atë që ka."
- button "Hap një skedar CSV…"
- link "Shkarko CSV shembull":
  - /url: /stock/import/template
- link "Kthehu te stoku":
  - /url: /stock
- textbox "NDR-0001 A-01-1-1 40 Kabllo 3x1.5 A-01-1-2 120":
  - /placeholder: "NDR-0001\tA-01-1-1\t40\nKabllo 3x1.5\tA-01-1-2\t120"
  - text: artikulli;kutia;sasia NDR-0001;D-01-1-1;3.0
- button "Kontrollo"
- button "Importo 1 rreshta"
- strong: 1 rreshta · 1 kuti · 30 njësi · 0 gabime
- text: Rreshti i titujve u njoh Rreshtat e parë siç do të hyjnë
- table:
  - rowgroup:
    - row "artikulli vendndodhja sasia":
      - columnheader "artikulli"
      - columnheader "vendndodhja"
      - columnheader "sasia"
  - rowgroup:
    - row "NDR-0001 D-01-1-1 30":
      - cell "NDR-0001"
      - cell "D-01-1-1"
      - cell "30"
- alert
```

# Test source

```ts
  5   | // so these drive the hidden <input type=file> — the path a customer actually
  6   | // uses to get a catalogue in, and the one the browser pane can't exercise.
  7   | const csv = (rows: string[][]) => rows.map((r) => r.join(";")).join("\r\n");
  8   | 
  9   | async function openCsv(page: import("@playwright/test").Page, name: string, body: string) {
  10  |   await page.locator('input[type=file]').setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(body, "utf8") });
  11  |   await page.getByRole("button", { name: /kontrollo/i }).click();
  12  | }
  13  | 
  14  | test.describe("items import", () => {
  15  |   test.beforeEach(async ({ adminPage: page }) => {
  16  |     await page.goto("/items/import");
  17  |   });
  18  | 
  19  |   test("a clean file previews as new rows and imports", async ({ adminPage: page }) => {
  20  |     const sku = `E2E-${Date.now()}`;
  21  |     await openCsv(page, "items.csv", csv([
  22  |       ["emri", "njësia", "SKU", "kategoria"],
  23  |       ["Çimento 42.5", "thasë", `${sku}-1`, "ndërtim"],
  24  |       ["Hekur 12mm", "copë", `${sku}-2`, "ndërtim"],
  25  |     ]));
  26  |     await expect(page.getByText(/2 të rinj/)).toBeVisible();
  27  |     await page.getByRole("button", { name: /^importo/i }).click();
  28  |     // /items/import also matches /items/, so pin the catalogue page itself.
  29  |     await page.waitForURL(/\/items$/);
  30  |     // The SKU is unique to this run; the name may exist from an earlier one.
  31  |     await expect(page.getByText(`${sku}-1`)).toBeVisible();
  32  |   });
  33  | 
  34  |   test("a duplicate SKU inside one file is reported with its row number", async ({ adminPage: page }) => {
  35  |     await openCsv(page, "dupe.csv", csv([
  36  |       ["emri", "njësia", "SKU"],
  37  |       ["Një", "copë", "DUP-1"],
  38  |       ["Dy", "copë", "DUP-1"],
  39  |     ]));
  40  |     await expect(page.getByText(/Rreshti 3/)).toBeVisible();
  41  |   });
  42  | 
  43  |   test("a field longer than the cap is refused, naming the row", async ({ adminPage: page }) => {
  44  |     await openCsv(page, "long.csv", csv([
  45  |       ["emri", "njësia"],
  46  |       ["x".repeat(MAX_FIELD_CHARS + 1), "copë"],
  47  |     ]));
  48  |     await expect(page.getByText(/Rreshti 2/)).toBeVisible();
  49  |   });
  50  | 
  51  |   test(`more than ${MAX_IMPORT_ROWS} rows is refused instead of timing out`, async ({ adminPage: page }) => {
  52  |     const rows = [["emri", "njësia", "SKU"]];
  53  |     for (let i = 0; i < MAX_IMPORT_ROWS + 1; i++) rows.push([`Artikull ${i}`, "copë", `BULK-${i}`]);
  54  |     await openCsv(page, "huge.csv", csv(rows));
  55  |     await expect(page.locator("body")).toContainText(/rresht/i);
  56  |     // Whatever it says, it must not have silently imported them.
  57  |     await expect(page.getByRole("button", { name: /^importo/i })).toHaveCount(0);
  58  |   });
  59  | 
  60  |   test("a comma-delimited file is understood too", async ({ adminPage: page }) => {
  61  |     const body = [["emri", "njësia", "SKU"], ["Presje", "copë", `COMMA-${Date.now()}`]]
  62  |       .map((r) => r.join(",")).join("\r\n");
  63  |     await openCsv(page, "comma.csv", body);
  64  |     await expect(page.getByText(/1 i ri|1 të rinj|1 i ri/)).toBeVisible();
  65  |   });
  66  | });
  67  | 
  68  | test.describe("stock import", () => {
  69  |   const BIN = "D-01-1-1";
  70  |   const SKU = "NDR-0001";
  71  | 
  72  |   test.beforeEach(async ({ adminPage: page }) => {
  73  |     await page.goto("/stock/import");
  74  |   });
  75  | 
  76  |   test("a clean count previews and imports as receive movements", async ({ adminPage: page }) => {
  77  |     await openCsv(page, "stock.csv", csv([
  78  |       ["artikulli", "kutia", "sasia"],
  79  |       [SKU, BIN, "40"],
  80  |     ]));
  81  |     await expect(page.locator("body")).toContainText("40");
  82  |     await expect(page.getByRole("button", { name: /^importo/i })).toBeVisible();
  83  |   });
  84  | 
  85  |   test("an unknown bin code is reported against its row, not imported", async ({ adminPage: page }) => {
  86  |     await openCsv(page, "badbin.csv", csv([
  87  |       ["artikulli", "kutia", "sasia"],
  88  |       [SKU, "ZZ-99-9-9", "5"],
  89  |     ]));
  90  |     await expect(page.getByText(/Rreshti 2/)).toBeVisible();
  91  |     await expect(page.getByRole("button", { name: /^importo/i })).toHaveCount(0);
  92  |   });
  93  | 
  94  |   // parseQuantity() strips every "." to tolerate a spreadsheet's thousands
  95  |   // separator, so a column formatted to one decimal place is multiplied by
  96  |   // ten with no warning: "3.0" becomes 30, "1.5" becomes 15, "2.75" becomes
  97  |   // 275. src/lib/import-locations.ts parseMetres() already does this right.
  98  |   test("a quantity written 3.0 stays 3 instead of becoming 30", async ({ adminPage: page }) => {
  99  |     test.fail();
  100 |     await openCsv(page, "decimal.csv", csv([
  101 |       ["artikulli", "kutia", "sasia"],
  102 |       [SKU, BIN, "3.0"],
  103 |     ]));
  104 |     // Today the summary reads "30 njësi" and reports 0 errors.
> 105 |     await expect(page.locator("body")).toContainText(/\b3 njësi\b/);
      |                                        ^ Error: expect(locator).toContainText(expected) failed
  106 |   });
  107 | });
  108 | 
```