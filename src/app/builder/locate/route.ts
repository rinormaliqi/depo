import { NextResponse } from "next/server";
import { rememberFacility } from "@/lib/facilities";
import { getMyOrgId } from "@/lib/session";
import { requireOwnedBin } from "@/lib/stock";
import { inOrg } from "@/lib/tenant";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Opens the map on the facility a bin is in, then on the bin (#215). Search
// results span every facility of the company, but /builder shows the one
// remembered in a cookie — and a page can't set cookies while it renders,
// so /builder?bin= of another facility bounces through here once.
export async function GET(req: Request) {
  return inOrg(async () => {
    const url = new URL(req.url);
    const bin = url.searchParams.get("bin") ?? "";
    const back = new URL("/builder", url);
    const organizationId = await getMyOrgId();
    if (!organizationId || !UUID.test(bin)) return NextResponse.redirect(back);
    try {
      const location = await requireOwnedBin(bin, organizationId);
      await rememberFacility(location.facilityId);
    } catch {
      // Not this company's bin, or gone: just the map.
      return NextResponse.redirect(back);
    }
    back.searchParams.set("bin", bin);
    back.searchParams.set("switched", "1");
    return NextResponse.redirect(back);
  });
}
