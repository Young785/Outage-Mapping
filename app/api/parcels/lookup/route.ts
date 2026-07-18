/**
 * POST /api/parcels/lookup
 * Body: { lat, lng } | { points: [{ lat, lng, id? }] }
 *
 * Looks up MetroGIS parcel land use, caches results, returns R1/R2/R3-style targeting.
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken, jwtErrorMessage } from "@/lib/jwt";
import {
  classifyParcelLandUse,
  lookupParcelAtLive,
  parcelCacheKey,
  type ParcelAttrs,
  type ParcelClassification,
} from "@/lib/parcel-landuse";

function requireAuth(req: Request) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  try {
    return { payload: verifyJWT(token) };
  } catch (err) {
    return { error: NextResponse.json({ error: jwtErrorMessage(err) }, { status: 401 }) };
  }
}

async function readCache(lat: number, lng: number): Promise<ParcelClassification | null> {
  if (!isSupabaseConfigured) return null;
  const key = parcelCacheKey(lat, lng);
  const db = getAdmin();
  const { data } = await db
    .from("parcel_land_use_cache")
    .select("*")
    .eq("lat_round", key.lat_round)
    .eq("lng_round", key.lng_round)
    .maybeSingle();
  if (!data) return null;
  const attrs = (data.raw_attrs || {}) as ParcelAttrs;
  return {
    isTargetResidential: !!data.is_target_residential,
    excludeReason: data.exclude_reason,
    useClassLabel: data.use_class1 || "cached",
    countyPin: data.county_pin,
    numUnits: data.num_units,
    dwellType: data.dwell_type,
    streetAddress: data.street_address,
    attrs,
  };
}

async function writeCache(lat: number, lng: number, c: ParcelClassification) {
  if (!isSupabaseConfigured) return;
  const key = parcelCacheKey(lat, lng);
  const db = getAdmin();
  await db.from("parcel_land_use_cache").upsert(
    {
      lat_round: key.lat_round,
      lng_round: key.lng_round,
      county_pin: c.countyPin,
      use_class1: c.attrs.USECLASS1 || c.useClassLabel,
      use_class2: c.attrs.USECLASS2 || null,
      use_class3: c.attrs.USECLASS3 || null,
      use_class4: c.attrs.USECLASS4 || null,
      num_units: c.numUnits,
      dwell_type: c.dwellType,
      street_address: c.streetAddress,
      is_target_residential: c.isTargetResidential,
      exclude_reason: c.excludeReason,
      raw_attrs: c.attrs,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "lat_round,lng_round" }
  );
}

async function lookupOne(lat: number, lng: number, skipCache = false) {
  if (!skipCache) {
    const cached = await readCache(lat, lng);
    if (cached) {
      return { found: true, classification: cached, source: "cache" as const };
    }
  }

  const live = await lookupParcelAtLive(lat, lng);
  if (live.found && live.classification) {
    await writeCache(lat, lng, live.classification);
  }
  return live;
}

export async function POST(req: Request) {
  try {
    const auth = requireAuth(req);
    if (auth.error) return auth.error;

    const body = await req.json();
    const skipCache = body.skipCache === true;

    if (Array.isArray(body.points)) {
      const points = body.points.slice(0, 40) as Array<{ lat: number; lng: number; id?: string }>;
      const results = [];
      for (const p of points) {
        const lat = Number(p.lat);
        const lng = Number(p.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          results.push({ id: p.id, error: "invalid lat/lng" });
          continue;
        }
        const r = await lookupOne(lat, lng, skipCache);
        results.push({ id: p.id, lat, lng, ...r });
      }
      return NextResponse.json({ results });
    }

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
    }

    const result = await lookupOne(lat, lng, skipCache);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Re-export helper for classify route typing
export { classifyParcelLandUse };
