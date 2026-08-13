/**
 * POST /api/simulation/generate
 * Creates synthetic outage records tagged as is_simulation=true.
 * count: 10 | 25 | 50 | 100
 * type: "mixed" | "clustered" | "sparse" | "honey_hole"
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";
import { MAX_MAP_CUSTOMERS } from "@/lib/routing-sweep";
import { buildSimulationOutageRow, insertOutageRows } from "@/lib/simulation-outage";

// Bounding box roughly covering the Twin Cities metro (Xcel service area)
const BOUNDS = { minLat: 44.7, maxLat: 45.15, minLng: -93.55, maxLng: -93.05 };

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

type ScenarioType = "mixed" | "clustered" | "sparse" | "honey_hole";

function buildOutages(count: number, type: ScenarioType) {
  const outages: Record<string, unknown>[] = [];
  const stamp = Date.now();

  const centers = Array.from({ length: Math.max(1, Math.ceil(count / 8)) }, () => ({
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
      customers =
        type === "honey_hole"
          ? Math.ceil(rand(3, MAX_MAP_CUSTOMERS + 0.99))
          : Math.ceil(rand(1, 8));
    } else {
      const useCluster = Math.random() < 0.5;
      if (useCluster) {
        const center = centers[i % centers.length];
        lat = center.lat + rand(-0.04, 0.04);
        lng = center.lng + rand(-0.04, 0.04);
      } else {
        lat = rand(BOUNDS.minLat, BOUNDS.maxLat);
        lng = rand(BOUNDS.minLng, BOUNDS.maxLng);
      }
      customers = Math.ceil(rand(1, MAX_MAP_CUSTOMERS + 0.99));
    }

    outages.push(
      buildSimulationOutageRow({
        id: `sim-gen-${stamp}-${i}`,
        lat,
        lng,
        customers,
        cause: type === "honey_hole" ? "clustered storm damage" : "storm damage",
        outageType: "Unplanned Outage",
        source: "xcel",
      })
    );
  }

  return outages;
}

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

    if (payload.role !== "admin" && payload.role !== "office" && payload.role !== "owner") {
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
    await db.from("outages").delete().eq("is_simulation", true);

    const outages = buildOutages(count, type);
    const { data, error } = await insertOutageRows(db, outages);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ created: data?.length ?? count, type, count });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
