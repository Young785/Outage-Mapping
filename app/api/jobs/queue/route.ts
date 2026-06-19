/**
 * GET /api/jobs/queue
 *
 * Unified job queue: merges outage markers + office jobs, sorted by priority.
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { haversineMiles } from "@/lib/priority";
import { calculateV1RouteScore, computeClusterMap, type StormPhase } from "@/lib/routing-v1";
import { calculateSimpleRouteScore } from "@/lib/routing-simple";
import { getRoutingMode } from "@/lib/routing-mode";

const ACTIVE_JOB_STATUSES = ["pending", "assigned", "in_progress"] as const;

const OUTAGE_QUEUE_STATUSES = [
  "sold",
  "job_started",
  "temp_power",
  "grounding",
  "wants_to_proceed",
] as const;

const OUTAGE_SELECT =
  "id, lat, lng, city, county, customers, outage_type, cause, etr, status, priority_score, street_address, source, first_seen_at";

function estimateDriveMinutes(miles: number | null): number | null {
  if (miles == null) return null;
  return Math.round((miles * 1.3) / 35 * 60);
}

function parseSimulationFlag(value: unknown): boolean {
  if (value === true || value === "true") return true;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) === true;
    } catch {
      return false;
    }
  }
  return false;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sort = searchParams.get("sort") ?? "priority";
  const techLat = searchParams.get("techLat") ? parseFloat(searchParams.get("techLat")!) : null;
  const techLng = searchParams.get("techLng") ? parseFloat(searchParams.get("techLng")!) : null;
  const techId = searchParams.get("techId") ?? null;

  if (!isSupabaseConfigured) {
    return NextResponse.json({ queue: [], total: 0 });
  }

  try {
    const db = getAdmin();

    let isSimulation = false;
    try {
      const { data: simRow, error: simErr } = await db
        .from("app_settings")
        .select("value")
        .eq("key", "simulation_mode")
        .maybeSingle();
      if (!simErr) isSimulation = parseSimulationFlag(simRow?.value);
    } catch {
      /* app_settings optional on fresh DB */
    }

    let jobsQuery = db.from("jobs").select("*").in("status", [...ACTIVE_JOB_STATUSES]);
    jobsQuery = isSimulation ? jobsQuery.eq("is_simulation", true) : jobsQuery.eq("is_simulation", false);

    const { data: jobs, error: jobsErr } = await jobsQuery;
    if (jobsErr) {
      console.error("[jobs/queue] jobs query:", jobsErr.message);
      return NextResponse.json({ error: jobsErr.message }, { status: 500 });
    }

    let outagesQuery = db
      .from("outages")
      .select(OUTAGE_SELECT)
      .eq("is_active", true)
      .in("status", [...OUTAGE_QUEUE_STATUSES]);
    outagesQuery = isSimulation
      ? outagesQuery.eq("is_simulation", true)
      : outagesQuery.eq("is_simulation", false);

    let { data: outages, error: outErr } = await outagesQuery;

    if (outErr && /status|check constraint|invalid input/i.test(outErr.message)) {
      const fallback = await db.from("outages").select(OUTAGE_SELECT).eq("is_active", true);
      outages = fallback.data;
      outErr = fallback.error;
    }

    if (outErr) {
      console.error("[jobs/queue] outages query:", outErr.message);
      return NextResponse.json(
        {
          error: outErr.message,
          hint: "Run supabase/migrations/20260528130000_workflow_roles_m007.sql on your database",
        },
        { status: 500 }
      );
    }

    let techTerritoryZips: string[] | null = null;
    if (techId) {
      const { data: techRow, error: techErr } = await db
        .from("technicians")
        .select("territory_id")
        .eq("user_id", techId)
        .maybeSingle();
      if (!techErr && techRow?.territory_id) {
        const { data: terr } = await db
          .from("territories")
          .select("zip_codes")
          .eq("id", techRow.territory_id)
          .maybeSingle();
        techTerritoryZips = terr?.zip_codes ?? null;
      }
    }

    function inTerritory(_lat: number | null, _lng: number | null): boolean {
      return techTerritoryZips == null || techTerritoryZips.length === 0;
    }

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
      if (!OUTAGE_QUEUE_STATUSES.includes(o.status as (typeof OUTAGE_QUEUE_STATUSES)[number])) {
        continue;
      }
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

    let stormPhase: StormPhase = "phase_1";
    const routingMode = await getRoutingMode();
    try {
      const { data: phaseRow } = await db.from("app_settings").select("value").eq("key", "storm_phase").maybeSingle();
      const p = phaseRow?.value;
      if (p === "phase_1" || p === "phase_2" || p === "phase_3") stormPhase = p;
    } catch {}

    const clusterMap =
      routingMode === "complicated"
        ? computeClusterMap(
            queueItems
              .filter((i) => i.lat != null && i.lng != null)
              .map((i) => ({ id: i.id, lat: i.lat!, lng: i.lng!, customers: i.customers }))
          )
        : new Map();

    for (const item of queueItems) {
      if (item.lat == null || item.lng == null) continue;
      if (routingMode === "simple") {
        const simple = calculateSimpleRouteScore(
          { status: item.status, customers: item.customers, source: item.source },
          item.distanceMiles ?? 0
        );
        item.priorityScore = simple.total;
      } else {
        const v1 = calculateV1RouteScore(
          {
            id: item.id,
            lat: item.lat,
            lng: item.lng,
            customers: item.customers,
            status: item.status,
            source: item.source,
            isOfficeLead: item.type === "job" || item.source === "office",
            driveMiles: item.distanceMiles ?? undefined,
          },
          stormPhase,
          clusterMap.get(String(item.id))
        );
        item.priorityScore = v1.total;
      }
    }

    const effectiveSort = routingMode === "simple" && (sort === "smart" || sort === "value") ? "distance" : sort;

    queueItems.sort((a, b) => {
      if (a.isConfirmed && !b.isConfirmed) return -1;
      if (!a.isConfirmed && b.isConfirmed) return 1;

      if (effectiveSort === "distance" && a.distanceMiles != null && b.distanceMiles != null) {
        return a.distanceMiles - b.distanceMiles;
      }
      if (effectiveSort === "value") {
        return (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
      }
      if (effectiveSort === "smart") {
        const smartA = (a.priorityScore ?? 0) - (a.distanceMiles ?? 0) * 8;
        const smartB = (b.priorityScore ?? 0) - (b.distanceMiles ?? 0) * 8;
        return smartB - smartA;
      }
      return b.priorityScore - a.priorityScore;
    });

    return NextResponse.json({ queue: queueItems, total: queueItems.length, routingMode });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Queue failed";
    console.error("[jobs/queue]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
