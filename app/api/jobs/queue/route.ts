/**
 * GET /api/jobs/queue
 *
 * Unified job queue: merges outage markers + office jobs, sorted by priority.
 * Confirmed opportunities override general hunting jobs.
 * Supports: ?sort=priority|distance|value&techLat=...&techLng=...&techId=...
 * Returns estimatedMinutes (drive time) and inTerritory flag per item.
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { haversineMiles } from "@/lib/priority";

/** Estimate drive time in minutes: straight-line × 1.3 road factor ÷ 35 mph avg */
function estimateDriveMinutes(miles: number | null): number | null {
  if (miles == null) return null;
  return Math.round((miles * 1.3) / 35 * 60);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sort = searchParams.get("sort") ?? "priority";
  const techLat = searchParams.get("techLat") ? parseFloat(searchParams.get("techLat")!) : null;
  const techLng = searchParams.get("techLng") ? parseFloat(searchParams.get("techLng")!) : null;
  const techId  = searchParams.get("techId") ?? null;
  const excludeStatus = searchParams.get("excludeStatus")?.split(",") ?? ["completed", "cancelled"];

  if (!isSupabaseConfigured) {
    return NextResponse.json({ queue: [], total: 0 });
  }

  try {
    const db = getAdmin();

    // Check simulation mode — when active, show simulation rows instead of live rows
    const { data: simRow } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "simulation_mode")
      .maybeSingle();
    const isSimulation = simRow?.value === true || simRow?.value === "true";

    // Get active jobs (office-created); respect simulation mode
    const jobsQuery = db
      .from("jobs")
      .select("*")
      .not("status", "in", `(${excludeStatus.map((s) => `"${s}"`).join(",")})`);
    const { data: jobs, error: jobsErr } = isSimulation
      ? await jobsQuery.eq("is_simulation", true)
      : await jobsQuery.eq("is_simulation", false);

    if (jobsErr) return NextResponse.json({ error: jobsErr.message }, { status: 500 });

    // Get active outages for job queue (actionable work only)
    // Per requirement: Job Queue should include only Call-ins, Self-generated leads,
    // and ArcGIS leads that are marked sold, started, complete, temp power installed, or return for grounding
    const actionableStatuses = ["sold", "job_started", "completed", "temp_power", "grounding", "opportunity", "wants_to_proceed", "door_hanger"];
    const outagesQuery = db
      .from("outages")
      .select("id, lat, lng, city, county, customers, outage_type, cause, etr, status, priority_score, street_address, source, first_seen_at, lead_source")
      .eq("is_active", true)
      .in("status", actionableStatuses);
    const { data: outages, error: outErr } = isSimulation
      ? await outagesQuery.eq("is_simulation", true)
      : await outagesQuery.eq("is_simulation", false);

    if (outErr) return NextResponse.json({ error: outErr.message }, { status: 500 });

    // Look up the requesting tech's territory zip codes (for in-territory flag)
    let techTerritoryZips: string[] | null = null;
    if (techId) {
      const { data: techRow } = await db
        .from("technicians")
        .select("territory_id, territories(zip_codes)")
        .eq("user_id", techId)
        .maybeSingle();
      techTerritoryZips = (techRow as any)?.territories?.zip_codes ?? null;
    }

    /** Check if a lat/lng falls within the tech's territory (zip approximation via bounding box) */
    function inTerritory(_lat: number | null, _lng: number | null): boolean {
      // Without polygon support we can't check precisely; return true when no territory set
      return techTerritoryZips == null || techTerritoryZips.length === 0;
    }

    // Normalize to queue items
    type QueueItem = {
      id: string;
      type: "job" | "outage";
      source: string;
      displayName: string;
      address: string | null;
      lat: number | null;
      lng: number | null;
      customers: number;
      priorityScore: number;
      status: string;
      isConfirmed: boolean;
      distanceMiles: number | null;
      estimatedMinutes: number | null;
      inTerritory: boolean;
      jobType: string | null;
      customerPhone: string | null;
      assignedTechId: string | null;
      priority: number | null;
      createdAt: string;
    };

    const queueItems: QueueItem[] = [];

    for (const j of jobs ?? []) {
      const dist =
        techLat != null && techLng != null && j.customer_lat && j.customer_lng
          ? haversineMiles(techLat, techLng, j.customer_lat, j.customer_lng)
          : null;
      queueItems.push({
        id: j.id,
        type: "job",
        source: j.source,
        displayName: j.customer_name ?? "Office Job",
        address: j.customer_address,
        lat: j.customer_lat,
        lng: j.customer_lng,
        customers: 1,
        priorityScore: j.priority_score ?? 0,
        status: j.status,
        isConfirmed: j.is_confirmed_opportunity ?? false,
        distanceMiles: dist ? Math.round(dist * 10) / 10 : null,
        estimatedMinutes: estimateDriveMinutes(dist),
        inTerritory: inTerritory(j.customer_lat, j.customer_lng),
        jobType: j.job_type,
        customerPhone: j.customer_phone,
        assignedTechId: j.assigned_tech_id,
        priority: j.priority ?? null,
        createdAt: j.created_at,
      });
    }

    for (const o of outages ?? []) {
      const dist =
        techLat != null && techLng != null && o.lat && o.lng
          ? haversineMiles(techLat, techLng, o.lat, o.lng)
          : null;
      queueItems.push({
        id: o.id,
        type: "outage",
        source: o.source,
        displayName: o.street_address?.split(",")[0] ?? o.city ?? "Outage",
        address: o.street_address ?? o.city,
        lat: o.lat,
        lng: o.lng,
        customers: o.customers ?? 0,
        priorityScore: o.priority_score ?? 0,
        status: o.status,
        isConfirmed: false,
        distanceMiles: dist ? Math.round(dist * 10) / 10 : null,
        estimatedMinutes: estimateDriveMinutes(dist),
        inTerritory: inTerritory(o.lat, o.lng),
        jobType: o.outage_type,
        customerPhone: null,
        assignedTechId: null,
        priority: null,
        createdAt: o.first_seen_at,
      });
    }

    // Sort
    queueItems.sort((a, b) => {
      // Confirmed opportunities always float to top
      if (a.isConfirmed && !b.isConfirmed) return -1;
      if (!a.isConfirmed && b.isConfirmed) return 1;

      if (sort === "distance" && a.distanceMiles != null && b.distanceMiles != null) {
        return a.distanceMiles - b.distanceMiles;
      }
      if (sort === "value") {
        return (b.customers ?? 0) - (a.customers ?? 0);
      }
      return b.priorityScore - a.priorityScore;
    });

    return NextResponse.json({ queue: queueItems, total: queueItems.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
