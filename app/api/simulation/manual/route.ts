/**
 * POST /api/simulation/manual
 * Creates a single simulation outage at specific coordinates.
 * Used by the "click map to place test outage" feature.
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";
import { buildSimulationOutageRow, insertOutageRows } from "@/lib/simulation-outage";

export async function POST(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try {
      payload = verifyJWT(token);
    } catch {
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
    const rows = [
      buildSimulationOutageRow({
        id: `sim-manual-${Date.now()}`,
        lat,
        lng,
        customers,
        outageType,
        cause: notes || cause,
        source: "xcel",
      }),
    ];

    const { data, error } = await insertOutageRows(db, rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, id: data?.[0]?.id ?? rows[0].id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
