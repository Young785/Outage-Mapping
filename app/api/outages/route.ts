/**
 * GET  /api/outages  — fetch live outages (Xcel + optional Connexus)
 * POST /api/outages  — upsert outage status from field update
 *
 * Adapter layer: Xcel/Connexus → YOUR API → Your App
 * Raw snapshots stored every fetch for audit/replay.
 * Fallback: if live fetch fails, serves last DB snapshot.
 * Simulation mode: returns synthetic storm data instead of live.
 */

import { NextResponse } from "next/server";
import { fetchAndNormalize, getLastSnapshot } from "@/lib/adapters";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { countNearby, getWeights, calculateScoreBreakdown } from "@/lib/priority";
import { calculateV1RouteScore, computeClusterMap, type StormPhase } from "@/lib/routing-v1";
import { calculateSimpleRouteScore } from "@/lib/routing-simple";
import { getRoutingMode } from "@/lib/routing-mode";
import { reverseGeocode } from "@/lib/geocache";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";
import { getActiveStormEvent, isPreviousStormMarker } from "@/lib/storm-events";
import { syncLinkedJobLocation } from "@/lib/marker-location";

const CENTER = { lat: 44.9778, lng: -93.265 };
const RADIUS_MILES = 40;

// ── Synthetic storm scenario (used when simulation mode has no DB scenario) ──
const SYNTHETIC_STORM = [
  { id: "sim-001", source: "simulation", lat: 44.9778, lng: -93.265,  city: "Minneapolis",   county: "HENNEPIN",  state: "MN", customers: 312, outageType: "Unplanned Outage", cause: "Storm Damage",    crewStatus: "En Route",    outageImpact: "Large",  status: "unvisited", priorityScore: 0, isSimulation: true },
  { id: "sim-002", source: "simulation", lat: 44.9537, lng: -93.2200, city: "Minneapolis",   county: "HENNEPIN",  state: "MN", customers: 87,  outageType: "Unplanned Outage", cause: "Tree Contact",    crewStatus: "No Crew",     outageImpact: "Medium", status: "unvisited", priorityScore: 0, isSimulation: true },
  { id: "sim-003", source: "simulation", lat: 44.8848, lng: -93.2988, city: "Bloomington",   county: "HENNEPIN",  state: "MN", customers: 203, outageType: "Unplanned Outage", cause: "Equipment Fault", crewStatus: "No Crew",     outageImpact: "Large",  status: "unvisited", priorityScore: 0, isSimulation: true },
  { id: "sim-004", source: "simulation", lat: 45.0458, lng: -93.3500, city: "Brooklyn Park", county: "HENNEPIN",  state: "MN", customers: 45,  outageType: "Unplanned Outage", cause: "Storm Damage",    crewStatus: "Crew Onsite", outageImpact: "Small",  status: "unvisited", priorityScore: 0, isSimulation: true },
  { id: "sim-005", source: "simulation", lat: 44.8233, lng: -93.1600, city: "Eagan",         county: "DAKOTA",    state: "MN", customers: 156, outageType: "Unplanned Outage", cause: "Lightning",       crewStatus: "No Crew",     outageImpact: "Large",  status: "unvisited", priorityScore: 0, isSimulation: true },
  { id: "sim-006", source: "simulation", lat: 45.1120, lng: -93.2100, city: "Fridley",       county: "ANOKA",     state: "MN", customers: 29,  outageType: "Planned Outage",   cause: "Maintenance",     crewStatus: "Crew Onsite", outageImpact: "Small",  status: "unvisited", priorityScore: 0, isSimulation: true },
  { id: "sim-007", source: "simulation", lat: 44.7441, lng: -93.2000, city: "Burnsville",    county: "DAKOTA",    state: "MN", customers: 421, outageType: "Unplanned Outage", cause: "Wind Damage",     crewStatus: "No Crew",     outageImpact: "Large",  status: "unvisited", priorityScore: 0, isSimulation: true },
  { id: "sim-008", source: "simulation", lat: 44.9726, lng: -93.4700, city: "St. Louis Park", county: "HENNEPIN", state: "MN", customers: 68,  outageType: "Unplanned Outage", cause: "Vehicle Damage",  crewStatus: "En Route",    outageImpact: "Medium", status: "unvisited", priorityScore: 0, isSimulation: true },
];

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── GET /api/outages ────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sourceParam = searchParams.get("sources"); // "xcel" | "connexus" | "xcel,connexus"
  const skipFilter = searchParams.get("all") === "true";

  // Determine active sources.
  // If the query param is present (even empty), it wins. Otherwise fall back to DB.
  let sources: Array<"xcel" | "connexus"> = ["xcel"];
  if (searchParams.has("sources")) {
    // Explicit override from the client — honour it even if it resolves to []
    sources = (sourceParam ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is "xcel" | "connexus" => s === "xcel" || s === "connexus");
  } else if (isSupabaseConfigured) {
    try {
      const db = getAdmin();
      const { data } = await db.from("app_settings").select("value").eq("key", "active_sources").maybeSingle();
      if (data?.value) sources = data.value as any;
    } catch {}
  }

  // Check simulation mode
  if (isSupabaseConfigured) {
    try {
      const db = getAdmin();
      const { data: simSetting } = await db.from("app_settings").select("value").eq("key", "simulation_mode").maybeSingle();
      if (simSetting?.value === true || simSetting?.value === "true") {
        // Try DB scenario first
        const { data: scenario } = await db
          .from("test_scenarios")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const simOutages = scenario?.outages ?? SYNTHETIC_STORM;

        return NextResponse.json({
          count: simOutages.length,
          features: simOutages,
          source: "simulation",
          isSimulation: true,
          fetchedAt: new Date().toISOString(),
        });
      }
    } catch {}
  }

  // Short-circuit when all sources explicitly disabled
  if (sources.length === 0) {
    return NextResponse.json({ count: 0, features: [], sources: [], fetchedAt: new Date().toISOString(), isStale: false });
  }

  // Fetch live data
  const { outages, results, snapshotIds } = await fetchAndNormalize(sources);

  // Check if all sources failed
  const allFailed = results.every((r) => r.error !== null);
  const errors = results.filter((r) => r.error).map((r) => `[${r.source}] ${r.error}`);

  // Fallback to last snapshot if live fetch failed
  let finalOutages = outages;
  let isStale = false;

  if (allFailed && isSupabaseConfigured) {
    console.warn("[outages] All sources failed, loading last snapshot");
    const fallbacks = await Promise.all(sources.map(getLastSnapshot));
    finalOutages = fallbacks.flat();
    isStale = true;
  }

  // Filter to radius (unless skip)
  const filtered = skipFilter
    ? finalOutages
    : finalOutages.filter(
        (o) =>
          o.lat != null &&
          o.lng != null &&
          haversineMiles(CENTER.lat, CENTER.lng, o.lat!, o.lng!) <= RADIUS_MILES
      );

  // Enrich with V1 priority scores + DB status + cached addresses (if configured)
  // Pull saved status AND street_address from DB so we return cached values
  let dbStatusMap: Record<string, string> = {};
  let dbAddressMap: Record<string, string> = {};
  let dbMetaMap: Record<string, any> = {};
  let officeMarkers: any[] = [];

  if (isSupabaseConfigured) {
    try {
      const db = getAdmin();
      const ids = filtered.map((o) => o.id);
      // Migration-007 columns that may not exist on older Supabase schemas.
      const M007_COLS = "customer_name, customer_phone, lead_source, assigned_tech_name, office_notes, external_job_status";
      const BASE_META_COLS = "id, status, street_address, priority_score, first_seen_at, source, zip_code, no_contact_made, needs_return_trip, storm_event_id";
      const BASE_OFFICE_COLS = "id, source, lat, lng, street_address, city, county, state, customers, outage_type, cause, etr, crew_status, outage_impact, status, priority_score, first_seen_at";

      if (ids.length > 0) {
        // Try with migration-007 columns; fall back to legacy columns if the DB is behind.
        let rows: any[] | null = null;
        const fullSel = await db
          .from("outages")
          .select(`${BASE_META_COLS}, ${M007_COLS}`)
          .in("id", ids);
        if (!fullSel.error) {
          rows = fullSel.data;
        } else {
          const liteSel = await db
            .from("outages")
            .select(BASE_META_COLS)
            .in("id", ids);
          rows = liteSel.data ?? null;
          if (liteSel.error) {
            console.warn("[outages] meta select fallback failed:", liteSel.error.message);
          }
        }
        if (rows) {
          rows.forEach((r: any) => {
            dbStatusMap[r.id] = r.status;
            if (r.street_address) dbAddressMap[r.id] = r.street_address;
            dbMetaMap[r.id] = r;
          });
        }
      }

      // Pull storm-app markers created outside utility feeds.
      // Two cases:
      //   (a) source explicitly in (office, self_generated, user)
      //   (b) source = manual but lead_source flags this as office/self_generated
      // We deliberately exclude xcel/connexus rows here — those are handled by
      // the utility feed enrichment path above (via filtered → enriched).
      let officeRows: any[] | null = null;
      const officeFull = await db
        .from("outages")
        .select(`${BASE_OFFICE_COLS}, ${M007_COLS}`)
        .eq("is_active", true)
        .not("source", "in", "(\"xcel\",\"connexus\")")
        .or("source.in.(office,self_generated,user),lead_source.in.(office,self_generated)");
      if (!officeFull.error) {
        officeRows = officeFull.data ?? [];
      } else {
        // Older schema: lead_source column doesn't exist, so neither the
        // SELECT nor the lead_source.in.() OR clause works. Fall back to
        // filtering by source only.
        const officeLite = await db
          .from("outages")
          .select(BASE_OFFICE_COLS)
          .eq("is_active", true)
          .not("source", "in", "(\"xcel\",\"connexus\")")
          .in("source", ["office", "self_generated", "user", "manual"]);
        if (!officeLite.error) {
          officeRows = officeLite.data ?? [];
        } else {
          console.warn("[outages] office select fallback failed:", officeLite.error.message);
          officeRows = [];
        }
      }
      officeMarkers = officeRows ?? [];

      // Fallback safety: if office jobs exist but outage mirror rows failed/missed,
      // synthesize map markers directly from jobs so queue/map stay aligned.
      const { data: officeJobs } = await db
        .from("jobs")
        .select("id, customer_name, customer_address, customer_lat, customer_lng, status, notes, priority_score, created_at")
        .eq("source", "office")
        .not("status", "in", "(\"completed\",\"cancelled\")");
      if (officeJobs?.length) {
        const existing = new Set((officeRows ?? []).map((r) => String(r.id)));
        const mapJobStatusToOutageStatus = (status: string | null) => {
          if (status === "completed") return "completed";
          if (status === "assigned" || status === "in_progress") return "unvisited";
          return "unvisited";
        };
        const synthesized = officeJobs
          .filter((j) => j.customer_lat != null && j.customer_lng != null)
          .filter((j) => !existing.has(`office-${j.id}`))
          .map((j) => {
            // Extract city from address if available
            const city = j.customer_address?.split(",")[1]?.trim() || null;
            return {
              id: `office-${j.id}`,
              source: "office",
              lat: j.customer_lat,
              lng: j.customer_lng,
              street_address: j.customer_address ?? null,
              city: city,
              county: "Unknown",
              state: null,
              customers: 1,
              outage_type: "Office Call-in Lead",
              cause: j.notes ?? "Office-entered lead",
              etr: null,
              crew_status: null,
              outage_impact: null,
              status: mapJobStatusToOutageStatus(j.status),
              priority_score: j.priority_score ?? 0,
              first_seen_at: j.created_at ?? new Date().toISOString(),
              customer_name: j.customer_name ?? null,
              customer_phone: null,
              lead_source: "office",
              assigned_tech_name: null,
              office_notes: j.notes ?? null,
              external_job_status: j.status ?? null,
            };
          });
        officeMarkers = [...(officeRows ?? []), ...synthesized];
      }
    } catch {}
  }

  let stormPhase: StormPhase = "phase_1";
  let tempOutMode = false;
  const routingMode = await getRoutingMode();
  const activeStormEvent = await getActiveStormEvent();
  const priorityWeights = routingMode === "simple" ? await getWeights() : null;

  if (isSupabaseConfigured) {
    try {
      const db = getAdmin();
      const { data: phaseRow } = await db.from("app_settings").select("value").eq("key", "storm_phase").maybeSingle();
      const p = phaseRow?.value;
      if (p === "phase_1" || p === "phase_2" || p === "phase_3") stormPhase = p;
      const { data: tempRow } = await db.from("app_settings").select("value").eq("key", "temp_out_mode").maybeSingle();
      tempOutMode = tempRow?.value === true || tempRow?.value === "true";
    } catch {}
  }

  const clusterMap =
    routingMode === "complicated"
      ? computeClusterMap(
          filtered
            .filter((o) => o.lat != null && o.lng != null)
            .map((o) => ({ id: o.id, lat: o.lat!, lng: o.lng!, customers: o.customers ?? 0 }))
        )
      : new Map();

  const enriched = filtered.map((o) => {
    const densityNearby = countNearby(
      o.lat!,
      o.lng!,
      filtered.filter((x) => x.id !== o.id).map((x) => ({ lat: x.lat!, lng: x.lng! }))
    );
    const baseStatus = (dbStatusMap[o.id] as any) ?? "unvisited";
    const isNew = !dbStatusMap[o.id] && (o.source === "xcel" || o.source === "connexus");
    const isHoneyHole =
      baseStatus === "opportunity" || baseStatus === "wants_to_proceed"
        ? (o.customers ?? 0) > 1
        : false;

    let scoreBreakdown: { finalScore: number; urgency: number; parts: Record<string, number> };
    let score: number;

    if (routingMode === "simple") {
      const milesFromCenter = haversineMiles(CENTER.lat, CENTER.lng, o.lat!, o.lng!);
      const simple = calculateSimpleRouteScore(
        { status: baseStatus, customers: o.customers ?? 0, source: o.source },
        milesFromCenter,
        { tempOutMode }
      );
      const legacy = calculateScoreBreakdown(
        {
          customers: o.customers ?? 0,
          outageType: o.outageType ?? "",
          isOfficeJob: o.source === "manual" || o.source === "user",
          densityNearby,
          firstSeenAt: dbMetaMap[o.id]?.first_seen_at ?? undefined,
          outageStatus: baseStatus,
        },
        priorityWeights!
      );
      score = Math.round((legacy.finalScore * 0.6 + simple.total * 0.4) * 100) / 100;
      scoreBreakdown = {
        finalScore: score,
        urgency: legacy.urgency,
        parts: { ...legacy.parts, ...simple.parts },
      };
    } else {
      const v1 = calculateV1RouteScore(
        {
          id: o.id,
          lat: o.lat!,
          lng: o.lng!,
          customers: o.customers ?? 0,
          status: baseStatus,
          source: o.source,
          isNew,
          isHoneyHole,
        },
        stormPhase,
        clusterMap.get(String(o.id)),
        { tempOutMode }
      );

      scoreBreakdown = {
        finalScore: v1.total,
        urgency: 0,
        parts: { ...v1.parts, densityLegacy: densityNearby > 0 ? Math.min(densityNearby, 5) * 4 : 0 },
      };
      score = v1.total + (scoreBreakdown.parts.densityLegacy as number);
      scoreBreakdown.finalScore = score;
    }

    return {
      ...o,
      // Prefer DB-cached address over ArcGIS data (adapter doesn't provide streetAddress)
      streetAddress: dbAddressMap[o.id] ?? null,
      status: baseStatus,
      priorityScore: isNew && routingMode === "complicated" ? Math.max(score + 15, score) : score,
      scoreBreakdown,
      isNew,
      milesFromCenter: haversineMiles(CENTER.lat, CENTER.lng, o.lat!, o.lng!),
      customerName: dbMetaMap[o.id]?.customer_name ?? null,
      customerPhone: dbMetaMap[o.id]?.customer_phone ?? null,
      leadSource: dbMetaMap[o.id]?.lead_source ?? null,
      assignedTechName: dbMetaMap[o.id]?.assigned_tech_name ?? null,
      officeNotes: dbMetaMap[o.id]?.office_notes ?? null,
      externalJobStatus: dbMetaMap[o.id]?.external_job_status ?? null,
      zipCode: dbMetaMap[o.id]?.zip_code ?? o.zipCode ?? null,
      noContactMade: dbMetaMap[o.id]?.no_contact_made ?? false,
      needsReturnTrip: dbMetaMap[o.id]?.needs_return_trip ?? false,
      stormEventId: dbMetaMap[o.id]?.storm_event_id ?? null,
      isPreviousStormMarker: isPreviousStormMarker(
        {
          stormEventId: dbMetaMap[o.id]?.storm_event_id,
          firstSeenAt: dbMetaMap[o.id]?.first_seen_at,
        },
        activeStormEvent
      ),
      firstSeenAt: dbMetaMap[o.id]?.first_seen_at ?? null,
      lastUpdatedAt: dbMetaMap[o.id]?.last_updated_at ?? null,
      isStaleMarker: !!dbMetaMap[o.id]?.first_seen_at
        && Date.now() - new Date(dbMetaMap[o.id].first_seen_at).getTime() > 48 * 60 * 60 * 1000,
      routingMode,
    };
  });

  const officeClusterMap =
    routingMode === "complicated"
      ? computeClusterMap(
          officeMarkers
            .filter((o) => o.lat != null && o.lng != null)
            .map((o) => ({ id: o.id, lat: o.lat!, lng: o.lng!, customers: o.customers ?? 1 }))
        )
      : new Map();

  const officeItems = officeMarkers
    .filter((o) => o.lat != null && o.lng != null)
    .map((o) => {
      const baseStatus = o.status ?? "unvisited";
      const milesFromCenter = haversineMiles(CENTER.lat, CENTER.lng, o.lat!, o.lng!);
      let priorityScore: number;
      let scoreBreakdown: { finalScore: number; urgency: number; parts: Record<string, number> };

      if (routingMode === "simple") {
        const simple = calculateSimpleRouteScore(
          { status: baseStatus, customers: o.customers ?? 1, source: o.source ?? "office" },
          milesFromCenter,
          { tempOutMode }
        );
        priorityScore = simple.total;
        scoreBreakdown = { finalScore: simple.total, urgency: 0, parts: simple.parts };
      } else {
        const v1 = calculateV1RouteScore(
          {
            id: o.id,
            lat: o.lat!,
            lng: o.lng!,
            customers: o.customers ?? 1,
            status: baseStatus,
            source: o.source ?? "office",
            isOfficeLead: true,
          },
          stormPhase,
          officeClusterMap.get(String(o.id)),
          { tempOutMode }
        );
        priorityScore = v1.total;
        scoreBreakdown = { finalScore: v1.total, urgency: 0, parts: v1.parts };
      }

      return {
      id: o.id,
      source: o.source,
      lat: o.lat,
      lng: o.lng,
      city: o.city,
      county: o.county,
      state: o.state,
      customers: o.customers ?? 1,
      outageType: o.outage_type ?? "Office Lead",
      cause: o.cause ?? "HouseCall Pro",
      etr: o.etr ?? null,
      crewStatus: o.crew_status ?? null,
      outageImpact: o.outage_impact ?? null,
      streetAddress: o.street_address ?? null,
      status: baseStatus,
      priorityScore,
      scoreBreakdown,
      milesFromCenter,
      customerName: o.customer_name ?? null,
      customerPhone: o.customer_phone ?? null,
      leadSource: o.lead_source ?? null,
      assignedTechName: o.assigned_tech_name ?? null,
      officeNotes: o.office_notes ?? null,
      externalJobStatus: o.external_job_status ?? null,
      firstSeenAt: o.first_seen_at ?? null,
      lastUpdatedAt: o.last_updated_at ?? null,
      isStaleMarker: !!o.first_seen_at
        && Date.now() - new Date(o.first_seen_at).getTime() > 48 * 60 * 60 * 1000,
    };
    });

  const allEnriched = [...enriched, ...officeItems];

  // Upsert enriched outages to DB (non-blocking)
  if (isSupabaseConfigured && enriched.length > 0 && !isStale) {
    const db = getAdmin();
    const rows = enriched.map((o, i) => ({
      id: o.id,
      source: o.source,
      lat: o.lat,
      lng: o.lng,
      city: o.city,
      county: o.county,
      state: o.state,
      zip_code: o.zipCode,
      customers: o.customers,
      outage_type: o.outageType,
      cause: o.cause,
      etr: o.etr,
      crew_status: o.crewStatus,
      outage_impact: o.outageImpact,
      priority_score: o.priorityScore,
      last_updated_at: new Date().toISOString(),
      is_active: true,
      snapshot_id: snapshotIds[0] ?? null,
    }));

    db.from("outages")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: false })
      .then(({ error }) => {
        if (error) console.error("[outages] Upsert error:", error.message);
      });

    // Background: geocode any outages that still lack a street_address
    const needsGeocode = enriched.filter((o) => !o.streetAddress && o.lat && o.lng);
    if (needsGeocode.length > 0) {
      Promise.all(
        needsGeocode.map(async (o) => {
          const geo = await reverseGeocode(o.lat!, o.lng!);
          if (geo?.formattedAddress) {
            await db
              .from("outages")
              .update({ street_address: geo.formattedAddress })
              .eq("id", o.id);
          }
        })
      ).catch((err) => console.warn("[outages] Background geocode error:", err));
    }
  }

  return NextResponse.json({
    count: allEnriched.length,
    radiusMiles: RADIUS_MILES,
    fetchedAt: new Date().toISOString(),
    features: allEnriched,
    sources,
    errors: errors.length ? errors : undefined,
    isStale,
    routingMode,
    activeStormEvent,
  });
}

// ── POST /api/outages  (update outage status) ───────────────────────────────
export async function POST(req: Request) {
  try {
    // Require a valid JWT — any authenticated role can update status
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try { verifyJWT(token); } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const body = await req.json();
    const { id, status, notes, streetAddress, lat, lng } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    if (
      status === undefined &&
      streetAddress === undefined &&
      lat === undefined &&
      lng === undefined &&
      notes === undefined
    ) {
      return NextResponse.json({ error: "status, streetAddress, lat/lng, or notes required" }, { status: 400 });
    }

    if (lat !== undefined || lng !== undefined) {
      if (lat == null || lng == null || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
        return NextResponse.json({ error: "lat and lng must both be valid numbers" }, { status: 400 });
      }
      const latN = Number(lat);
      const lngN = Number(lng);
      if (latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
        return NextResponse.json({ error: "lat/lng out of range" }, { status: 400 });
      }
    }

    const validStatuses = [
      "unvisited", "investigating", "no_opportunity", "opportunity",
      "door_hanger", "wants_to_proceed", "customer_thinking", "sold",
      "job_started", "temp_power", "grounding", "completed",
    ];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    if (isSupabaseConfigured) {
      const db = getAdmin();
      let statusToWrite = status;
      if (!statusToWrite) {
        const { data: existing } = await db.from("outages").select("status").eq("id", String(id)).maybeSingle();
        statusToWrite = existing?.status ?? "unvisited";
      }
      const update: any = { last_updated_at: new Date().toISOString() };
      if (status) update.status = status;
      else update.status = statusToWrite;
      if (streetAddress !== undefined) update.street_address = streetAddress;
      if (notes !== undefined) update.cause = notes;
      if (lat !== undefined && lng !== undefined) {
        update.lat = Number(lat);
        update.lng = Number(lng);
      }
      if (status === "completed") update.needs_return_trip = false;
      // Persist lead_source so the square shape survives later status changes.

      console.log("[outages POST] update payload for id=", id, "→", update);

      let { error } = await db.from("outages").update(update).eq("id", String(id));
      if (error && /lead_source/.test(error.message ?? "")) {
        console.warn("[outages POST] lead_source write rejected:", error.message);
        // DB schema is behind migration 007 — retry without lead_source so the
        // status update at least lands. Shape will fall back to status-driven.
        delete update.lead_source;
        const retry = await db.from("outages").update(update).eq("id", String(id));
        error = retry.error;
      }
      if (error) {
        console.error("[outages POST] update failed:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (lat !== undefined && lng !== undefined) {
        try {
          await syncLinkedJobLocation(db, String(id), Number(lat), Number(lng), streetAddress ?? null);
        } catch (syncErr) {
          console.warn("[outages POST] linked job location sync failed:", syncErr);
        }
      }

      // Read it back so we can see if lead_source actually landed.
      const { data: rb } = await db.from("outages").select("id, status, source, lead_source").eq("id", String(id)).maybeSingle();
      console.log("[outages POST] readback for id=", id, "→", rb);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
