/**
 * POST /api/simulation/load-snapshot
 * Loads a stored outage snapshot into simulation mode.
 * Clears previous simulation outages, then inserts from the snapshot's normalized data.
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
      .select("raw_data, normalized_count, fetched_at, source")
      .eq("id", snapshotId)
      .single();

    if (snErr || !snapshot) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }

    // Parse normalized outage rows out of raw_data (ArcGIS FeatureCollection or array)
    let features: any[] = [];
    try {
      const raw = snapshot.raw_data;
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

    const outages = features.slice(0, 500).map((f: any, i: number) => {
      const attrs = f.attributes ?? f;
      const geo = f.geometry ?? {};
      const lat = parseFloat(String(geo.y ?? attrs.lat ?? attrs.latitude ?? ""));
      const lng = parseFloat(String(geo.x ?? attrs.lng ?? attrs.longitude ?? ""));
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const originalId = attrs.id ?? attrs.xcel_id ?? i;
      return buildSimulationOutageRow({
        id: `sim-snap-${snapshotId}-${originalId}`,
        lat,
        lng,
        city: attrs.city ?? attrs.CITY ?? null,
        county: attrs.county ?? attrs.COUNTY ?? null,
        state: attrs.state ?? attrs.STATE ?? null,
        streetAddress: attrs.streetAddress ?? attrs.street_address ?? attrs.address ?? null,
        zipCode: attrs.zipCode ?? attrs.zip_code ?? attrs.ZIP ?? null,
        customers: parseInt(String(attrs.customers ?? attrs.CUSTOMERS ?? attrs.customersAffected ?? 1), 10) || 1,
        capCustomers: false,
        outageType: attrs.outageType ?? attrs.outage_type ?? "Unplanned Outage",
        cause: attrs.cause ?? null,
        crewStatus: attrs.crewStatus ?? attrs.crew_status ?? "none",
        etr: attrs.etr ?? null,
        source: snapshot.source === "connexus" ? "connexus" : "xcel",
      });
    }).filter((o): o is NonNullable<typeof o> => o !== null);

    if (outages.length === 0) {
      return NextResponse.json({ error: "No valid outage coordinates in snapshot" }, { status: 422 });
    }

    const { data: inserted, error: insErr } = await insertOutageRows(db, outages);

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
