/**
 * POST /api/simulation/manual
 * Creates a single simulation outage at specific coordinates.
 * Used by the "click map to place test outage" feature.
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";

export async function POST(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try { payload = verifyJWT(token); } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (!["admin", "office", "owner"].includes(payload.role)) {
      return NextResponse.json({ error: "Office role required" }, { status: 403 });
    }

    const { lat, lng, customers = 1, outageType = "storm", cause = "Manual test outage", notes } = await req.json();

    if (typeof lat !== "number" || typeof lng !== "number") {
      return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
    }

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });

    const db = getAdmin();
    const now = new Date().toISOString();

    const { data, error } = await db
      .from("outages")
      .insert({
        xcel_id: `MANUAL-${Date.now()}`,
        lat,
        lng,
        city: "Manual Test",
        county: "Test County",
        customers: Math.max(1, Math.round(customers)),
        status: "unvisited",
        outage_type: outageType,
        cause: notes || cause,
        crew_status: "none",
        etr: null,
        raw_data: { manual: true },
        fetched_at: now,
        is_simulation: true,
        is_active: true,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: data.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
