import { NextResponse } from "next/server";
import { getCapabilities } from "@/lib/capabilities";
import { getUnderlayImage, ownedFacility, putUnderlay, UNDERLAY_MAX_BYTES, UNDERLAY_MIME } from "@/lib/underlay";

// The underlay's bytes. A route handler rather than a server action: the
// image is fetched by an <img>, not by code, and an upload of a few MB is
// past what a server action's body accepts. Same ownership check as the
// builder's actions; private cache keyed on the version in the URL.
export async function GET(_req: Request, { params }: { params: Promise<{ facilityId: string }> }) {
  const { facilityId } = await params;
  if (!(await ownedFacility(facilityId))) return new NextResponse(null, { status: 404 });
  const row = await getUnderlayImage(facilityId);
  if (!row) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
      ETag: `"${row.updatedAt.getTime()}"`,
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ facilityId: string }> }) {
  const { facilityId } = await params;
  const facility = await ownedFacility(facilityId);
  if (!facility) return NextResponse.json({ error: "notFound" }, { status: 404 });
  const caps = await getCapabilities();
  if (!caps?.can.editLayout) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  const widthPx = Number(form.get("widthPx"));
  const heightPx = Number(form.get("heightPx"));
  if (!(file instanceof Blob)) return NextResponse.json({ error: "noFile" }, { status: 400 });
  if (!(UNDERLAY_MIME as readonly string[]).includes(file.type)) return NextResponse.json({ error: "badType" }, { status: 415 });
  if (file.size > UNDERLAY_MAX_BYTES) return NextResponse.json({ error: "tooLarge" }, { status: 413 });
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx < 16 || heightPx < 16) {
    return NextResponse.json({ error: "badDimensions" }, { status: 400 });
  }

  await putUnderlay(facility, {
    mimeType: file.type,
    data: Buffer.from(await file.arrayBuffer()),
    widthPx: Math.round(widthPx),
    heightPx: Math.round(heightPx),
  });
  return NextResponse.json({ ok: true });
}
