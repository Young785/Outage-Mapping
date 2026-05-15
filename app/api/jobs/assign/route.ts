/**
 * POST /api/jobs/assign
 *
 * Find the closest available (green-status) tech to a job/outage.
 * Returns the recommended tech — office must confirm before dispatch.
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";
import { haversineMiles } from "@/lib/priority";

export async function POST(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try { payload = verifyJWT(token); } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (payload.role !== "office" && payload.role !== "admin") {
      return NextResponse.json({ error: "Office role required" }, { status: 403 });
    }

    const { jobId, outageId, targetLat, targetLng, confirm = false } = await req.json();

    const itemId = jobId ?? outageId;
    const itemType: "job" | "outage" = outageId ? "outage" : "job";

    if (!itemId || targetLat == null || targetLng == null) {
      return NextResponse.json({ error: "jobId or outageId + targetLat + targetLng required" }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ error: "Database required for tech assignment" }, { status: 503 });
    }

    const db = getAdmin();

    // Find available techs with location
    const { data: techs } = await db
      .from("technicians")
      .select("*, users(id, name, email)")
      .eq("status", "available")
      .not("current_lat", "is", null)
      .not("current_lng", "is", null);

    if (!techs || techs.length === 0) {
      return NextResponse.json({ error: "No available techs with known location" }, { status: 404 });
    }

    // Territory-first dispatch: try to find the closest tech whose territory contains the target
    // Territory is matched by zip code. Determine target zip from outage/job data.
    let targetZip: string | null = null;
    if (itemType === "outage") {
      const { data: outage } = await db.from("outages").select("zip_code").eq("id", itemId).maybeSingle();
      targetZip = outage?.zip_code ?? null;
    } else {
      const { data: job } = await db.from("jobs").select("customer_address").eq("id", itemId).maybeSingle();
      // crude zip extraction from address string e.g. "... CO 80201"
      const match = job?.customer_address?.match(/\b(\d{5})\b/);
      if (match) targetZip = match[1];
    }

    let inTerritoryTechs: typeof techs = [];
    if (targetZip) {
      const { data: territories } = await db
        .from("territories")
        .select("id, zip_codes")
        .not("zip_codes", "is", null);
      const matchingTerritoryIds = (territories ?? [])
        .filter((t) => (t.zip_codes as string[]).includes(targetZip!))
        .map((t) => t.id);
      if (matchingTerritoryIds.length > 0) {
        inTerritoryTechs = techs.filter((t) => matchingTerritoryIds.includes(t.territory_id));
      }
    }

    // Use in-territory techs if any, otherwise fall back to all available techs
    const candidateTechs = inTerritoryTechs.length > 0 ? inTerritoryTechs : techs;
    const usedTerritoryFilter = inTerritoryTechs.length > 0;

    // Find closest among candidates
    let closest = candidateTechs[0];
    let minDist = haversineMiles(targetLat, targetLng, closest.current_lat!, closest.current_lng!);

    for (const t of candidateTechs.slice(1)) {
      const d = haversineMiles(targetLat, targetLng, t.current_lat!, t.current_lng!);
      if (d < minDist) { minDist = d; closest = t; }
    }

    const recommended = {
      techId: closest.user_id,
      techName: (closest.users as any)?.name ?? "Unknown",
      techEmail: (closest.users as any)?.email ?? null,
      distanceMiles: Math.round(minDist * 10) / 10,
      currentLat: closest.current_lat,
      currentLng: closest.current_lng,
      inTerritory: usedTerritoryFilter,
    };

    // If confirmed, persist the assignment
    if (confirm) {
      if (itemType === "job") {
        await db.from("jobs").update({
          assigned_tech_id: closest.user_id,
          status: "assigned",
          updated_at: new Date().toISOString(),
        }).eq("id", itemId);
      } else {
        // For outage-type items, create an office job linked to the outage
        await db.from("jobs").insert({
          source: "office",
          outage_id: itemId,
          customer_address: `Outage at ${targetLat.toFixed(4)}, ${targetLng.toFixed(4)}`,
          customer_lat: targetLat,
          customer_lng: targetLng,
          job_type: "repair",
          priority: 7,
          status: "assigned",
          assigned_tech_id: closest.user_id,
          priority_score: 0,
          created_by: payload.sub,
        });
        // Set outage status to investigating when a tech is dispatched
        await db.from("outages").update({
          status: "investigating",
          last_updated_at: new Date().toISOString(),
        }).eq("id", itemId);
      }

      await db.from("technicians").update({
        status: "working",
        current_job_id: itemId,
        updated_at: new Date().toISOString(),
      }).eq("user_id", closest.user_id);
    }

    return NextResponse.json({ recommended, confirmed: confirm });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
