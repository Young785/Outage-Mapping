/**
 * POST /api/simulation/generate
 * Creates synthetic outage records tagged as is_simulation=true.
 * count: 10 | 25 | 50 | 100
 * type: "mixed" | "clustered" | "sparse" | "honey_hole"
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";

// Bounding box roughly covering Xcel Energy's Colorado/Minnesota service area
const BOUNDS = { minLat: 44.4, maxLat: 45.2, minLng: -94.0, maxLng: -93.0 };

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

type ScenarioType = "mixed" | "clustered" | "sparse" | "honey_hole";

function buildOutages(count: number, type: ScenarioType) {
  const now = new Date().toISOString();
  const outages: Record<string, unknown>[] = [];

  // Cluster centers for clustered/honey_hole scenarios
  const centers = Array.from({ length: Math.ceil(count / 8) }, () => ({
    lat: rand(BOUNDS.minLat, BOUNDS.maxLat),
    lng: rand(BOUNDS.minLng, BOUNDS.maxLng),
  }));

  for (let i = 0; i < count; i++) {
    let lat: number, lng: number, customers: number;

    if (type === "sparse") {
      lat = rand(BOUNDS.minLat, BOUNDS.maxLat);
      lng = rand(BOUNDS.minLng, BOUNDS.maxLng);
      customers = Math.ceil(rand(1, 3));
    } else if (type === "clustered" || type === "honey_hole") {
      const center = centers[i % centers.length];
      const spread = type === "clustered" ? 0.05 : 0.02;
      lat = center.lat + rand(-spread, spread);
      lng = center.lng + rand(-spread, spread);
      customers = type === "honey_hole" ? Math.ceil(rand(3, 15)) : Math.ceil(rand(1, 8));
    } else {
      // mixed
      const useCluster = Math.random() < 0.5;
      if (useCluster) {
        const center = centers[i % centers.length];
        lat = center.lat + rand(-0.04, 0.04);
        lng = center.lng + rand(-0.04, 0.04);
      } else {
        lat = rand(BOUNDS.minLat, BOUNDS.maxLat);
        lng = rand(BOUNDS.minLng, BOUNDS.maxLng);
      }
      customers = Math.ceil(rand(1, 10));
    }

    outages.push({
      xcel_id: `SIM-${Date.now()}-${i}`,
      lat,
      lng,
      city: "Simulation City",
      county: "Sim County",
      customers,
      status: "unvisited",
      outage_type: "storm",
      cause: "storm damage",
      crew_status: "none",
      etr: null,
      raw_data: { synthetic: true, scenario_type: type },
      fetched_at: now,
      is_simulation: true,
    });
  }

  return outages;
}

export async function POST(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try { payload = verifyJWT(token); } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (payload.role !== "admin" && payload.role !== "office") {
      return NextResponse.json({ error: "Admin/office role required" }, { status: 403 });
    }

    const body = await req.json();
    const count: number = [10, 25, 50, 100].includes(body.count) ? body.count : 25;
    const type: ScenarioType = ["mixed", "clustered", "sparse", "honey_hole"].includes(body.type)
      ? body.type
      : "mixed";

    if (!isSupabaseConfigured) {
      return NextResponse.json({ created: count, stored: false });
    }

    const db = getAdmin();
    // Clear previous synthetic outages before inserting fresh ones
    await db.from("outages").delete().eq("is_simulation", true);

    const outages = buildOutages(count, type);
    const { data, error } = await db.from("outages").insert(outages).select("id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ created: data?.length ?? count, type, count });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
