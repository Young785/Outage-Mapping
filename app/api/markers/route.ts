import { NextResponse } from "next/server";
import { extractBearerToken, verifyJWT } from "@/lib/jwt";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try { verifyJWT(token); } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }

    const body = await req.json();
    const {
      id,
      lat,
      lng,
      markerType = "triangle",
      leadSource,
      customerName,
      customerPhone,
      streetAddress,
      notes,
      status = "unvisited",
    } = body;

    if (!id || lat == null || lng == null) {
      return NextResponse.json({ error: "id, lat, lng required" }, { status: 400 });
    }

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });
    const db = getAdmin();
    const row = {
      id: String(id),
      source: markerType === "triangle" ? "office" : "xcel",
      lat,
      lng,
      street_address: streetAddress ?? null,
      customer_name: customerName ?? null,
      customer_phone: customerPhone ?? null,
      lead_source: leadSource ?? null,
      office_notes: notes ?? null,
      status,
      is_active: true,
      first_seen_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
    };
    const { error } = await db.from("outages").upsert(row, { onConflict: "id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, marker: row });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
