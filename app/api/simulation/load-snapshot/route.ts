/**
 * POST /api/simulation/load-snapshot
 * Loads a stored outage snapshot into simulation mode.
 * Clears previous simulation outages, then inserts from the snapshot's normalized data.
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

    const { snapshotId } = await req.json();
    if (!snapshotId) return NextResponse.json({ error: "snapshotId required" }, { status: 400 });

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });

    const db = getAdmin();

    // Fetch the snapshot
    const { data: snapshot, error: snErr } = await db
      .from("outage_snapshots")
      .select("raw_response, normalized_count, fetched_at, source")
      .eq("id", snapshotId)
      .single();

    if (snErr || !snapshot) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }

    // Parse normalized outage rows out of raw_response
    // raw_response is the ArcGIS FeatureCollection or our normalized array
    let features: any[] = [];
    try {
      const raw = snapshot.raw_response;
      if (Array.isArray(raw)) {
        features = raw;
      } else if (raw?.features) {
        features = raw.features;
      } else if (raw?.outages) {
        features = raw.outages;
      }
    } catch {
      return NextResponse.json({ error: "Could not parse snapshot data" }, { status: 422 });
    }

    if (features.length === 0) {
      return NextResponse.json({ error: "Snapshot contains no outage data" }, { status: 422 });
    }

    // Clear previous simulation outages
    await db.from("outages").delete().eq("is_simulation", true);

    // Map features to outage records
    const now = new Date().toISOString();
    const outages = features.slice(0, 500).map((f: any) => {
      const attrs = f.attributes ?? f;
      const geo = f.geometry ?? {};
      const lat = geo.y ?? attrs.lat ?? attrs.latitude ?? null;
      const lng = geo.x ?? attrs.lng ?? attrs.longitude ?? null;
      if (!lat || !lng) return null;
      return {
        xcel_id: `SNAP-${snapshotId}-${attrs.id ?? attrs.xcel_id ?? Math.random()}`,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        city: attrs.city ?? attrs.CITY ?? null,
        county: attrs.county ?? attrs.COUNTY ?? null,
        customers: parseInt(attrs.customers ?? attrs.CUSTOMERS ?? attrs.customersAffected ?? 1) || 1,
        status: "unvisited",
        outage_type: attrs.outageType ?? attrs.outage_type ?? "storm",
        cause: attrs.cause ?? null,
        crew_status: attrs.crewStatus ?? attrs.crew_status ?? "none",
        etr: attrs.etr ?? null,
        raw_data: { from_snapshot: snapshotId, original: attrs },
        fetched_at: snapshot.fetched_at ?? now,
        is_simulation: true,
        is_active: true,
      };
    }).filter((o): o is NonNullable<typeof o> => o !== null);

    if (outages.length === 0) {
      return NextResponse.json({ error: "No valid outage coordinates in snapshot" }, { status: 422 });
    }

    const { data: inserted, error: insErr } = await db
      .from("outages")
      .insert(outages)
      .select("id");

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      loaded: inserted?.length ?? outages.length,
      snapshotDate: snapshot.fetched_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
