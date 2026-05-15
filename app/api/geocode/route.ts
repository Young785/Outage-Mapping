/**
 * POST /api/geocode
 * - `{ address: string }` — forward geocode (street address → lat/lng)
 * - `{ lat, lng }` — reverse geocode (coords → address); reverse results cached in DB
 */

import { NextResponse } from "next/server";
import { forwardGeocode, reverseGeocode } from "@/lib/geocache";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const addr =
      typeof body.address === "string" ? body.address.trim() : "";

    if (addr) {
      const result = await forwardGeocode(addr);
      if (!result) {
        return NextResponse.json(
          { error: "Could not geocode that address" },
          { status: 404 }
        );
      }
      return NextResponse.json({
        success: true,
        mode: "forward",
        lat: result.lat,
        lng: result.lng,
        formattedAddress: result.formattedAddress,
      });
    }

    const { lat, lng } = body;

    if (lat == null || lng == null) {
      return NextResponse.json(
        { error: "Provide address or lat/lng" },
        { status: 400 }
      );
    }

    const result = await reverseGeocode(Number(lat), Number(lng));

    if (!result) {
      return NextResponse.json(
        { error: "Could not geocode these coordinates" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, mode: "reverse", address: result });
  } catch (err: any) {
    console.error("[geocode] Error:", err);
    return NextResponse.json({ error: err.message ?? "Geocoding failed" }, { status: 500 });
  }
}
