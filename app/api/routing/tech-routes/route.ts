/**
 * GET  /api/routing/tech-routes — list per-tech ordered routes
 * POST /api/routing/tech-routes — mutate routes (add/remove/reorder/auto_populate/not_target)
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { extractBearerToken, verifyJWT } from "@/lib/jwt";
import {
  defaultTruckColor,
  insertStopInSpatialOrder,
  rankCandidatesForTech,
  type RouteControl,
  type TechRouteBundle,
} from "@/lib/tech-routes";
import { haversineMiles } from "@/lib/priority";
import {
  isRoutingMapVisibleOutage,
  type MapEligibilityContext,
} from "@/lib/map-marker-eligibility";
import { type ExcludedProperty } from "@/lib/excluded-properties";
import { isValidMapCoordinate, parseRouteControl } from "@/lib/storm-outage";
import { territoryCentroid, territoryFromRow, zoneTypeOf, type BoundaryZoneLike } from "@/lib/territory-match";

function canManage(role: string) {
  return role === "office" || role === "admin" || role === "owner";
}

type Db = ReturnType<typeof getAdmin>;

async function loadRouteControlFallback(db: Db): Promise<Record<string, RouteControl>> {
  try {
    const { data } = await db
      .from("app_settings")
      .select("value")
      .eq("key", "tech_route_control")
      .maybeSingle();
    const value = data?.value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const map: Record<string, RouteControl> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        map[k] = parseRouteControl(v);
      }
      return map;
    }
  } catch {
    /* ignore */
  }
  return {};
}

async function ensureTechnicianRow(db: Db, techUserId: string) {
  const { data } = await db.from("technicians").select("user_id").eq("user_id", techUserId).maybeSingle();
  if (data?.user_id) return;
  const { error } = await db.from("technicians").insert({
    user_id: techUserId,
    status: "available",
    route_control: "manual",
    updated_at: new Date().toISOString(),
  });
  if (error && !/duplicate|unique/i.test(error.message)) {
    // Older DBs without route_control — retry without it.
    if (/route_control|schema cache|does not exist/i.test(error.message)) {
      const retry = await db.from("technicians").insert({
        user_id: techUserId,
        status: "available",
        updated_at: new Date().toISOString(),
      });
      if (retry.error && !/duplicate|unique/i.test(retry.error.message)) {
        throw new Error(retry.error.message);
      }
      return;
    }
    throw new Error(error.message);
  }
}

async function saveRouteControl(db: Db, techUserId: string, control: RouteControl) {
  await ensureTechnicianRow(db, techUserId);
  const { error } = await db
    .from("technicians")
    .update({ route_control: control, updated_at: new Date().toISOString() })
    .eq("user_id", techUserId);
  if (error && /route_control|schema cache|does not exist/i.test(error.message)) {
    const map = await loadRouteControlFallback(db);
    map[techUserId] = control;
    await db.from("app_settings").upsert(
      { key: "tech_route_control", value: map, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  } else if (error) {
    throw new Error(error.message);
  }
}

function assignmentNoteFor(args: {
  status: string;
  routeControl: RouteControl;
  hasGps: boolean;
  stopCount: number;
}): string | null {
  if (args.stopCount > 0) {
    return args.routeControl === "manual" ? "MANUAL — office/tech owns this string route" : null;
  }
  if (args.status === "offline") return "Offline — automatic routing skips this technician";
  if (args.routeControl === "manual") {
    return "MANUAL mode with no stops — tap map dots or right-click a marker to add";
  }
  if (!args.hasGps) {
    return "No GPS location — automatic routing needs a live location or a territory polygon";
  }
  return "No eligible visible markers near this technician (planned/hidden/excluded/already claimed)";
}

async function loadMapEligibilityContext(db: Db): Promise<MapEligibilityContext> {
  const [{ data: excludedRows }, { data: territoryRows }] = await Promise.all([
    db
      .from("excluded_properties")
      .select("id, address, address_key, lat, lng, radius_meters, county_pin, is_active")
      .eq("is_active", true),
    db.from("territories").select("id, type, zip_codes, geometry"),
  ]);

  const excludedProperties = (excludedRows ?? []) as ExcludedProperty[];
  const exclusionZones = (territoryRows ?? []).filter(
    (z) => zoneTypeOf(z as BoundaryZoneLike) === "exclusion"
  ) as BoundaryZoneLike[];

  return { excludedProperties, exclusionZones };
}

async function purgeIneligibleRouteStops(
  db: Db,
  stops: Array<{ tech_user_id: string; outage_id: string }>,
  outageMap: Map<string, { id: string }>
) {
  const stale = stops.filter((s) => !outageMap.has(String(s.outage_id)));
  if (stale.length === 0) return;

  await Promise.all(
    stale.map((s) =>
      db
        .from("tech_route_stops")
        .delete()
        .eq("tech_user_id", s.tech_user_id)
        .eq("outage_id", s.outage_id)
    )
  );
}

function techsWithOrigin<
  T extends {
    user_id: string;
    status: string;
    current_lat: number | null;
    current_lng: number | null;
    territory_id?: string | null;
    route_control?: unknown;
    users?: unknown;
  }
>(
  techs: T[],
  territoryById: Map<string, { zip_codes?: string[] | null; geometry?: { coordinates?: number[][][] } | null }>
): Array<T & { routeControl: RouteControl; origin: { lat: number; lng: number } | null }> {
  return techs.map((t) => {
    const routeControl = parseRouteControl(t.route_control);
    let origin: { lat: number; lng: number } | null = null;
    if (isValidMapCoordinate(t.current_lat, t.current_lng)) {
      origin = { lat: Number(t.current_lat), lng: Number(t.current_lng) };
    } else if (t.territory_id) {
      const row = territoryById.get(t.territory_id);
      if (row) origin = territoryCentroid(territoryFromRow(row));
    }
    return { ...t, routeControl, origin };
  });
}

async function loadRouteBundles(
  db: Db,
  filterTechUserId?: string | null
): Promise<TechRouteBundle[]> {
  const fallbackControl = await loadRouteControlFallback(db);
  const eligibilityCtx = await loadMapEligibilityContext(db);
  let techQuery = db
    .from("technicians")
    .select("user_id, status, current_lat, current_lng, map_color, route_control, territory_id, users(id, name)")
    .order("updated_at", { ascending: false });

  if (filterTechUserId) {
    techQuery = techQuery.eq("user_id", filterTechUserId);
  }

  let { data: techs, error: techErr } = await techQuery;
  if (techErr && /route_control|schema cache|does not exist/i.test(techErr.message)) {
    const retry = db
      .from("technicians")
      .select("user_id, status, current_lat, current_lng, map_color, territory_id, users(id, name)")
      .order("updated_at", { ascending: false });
    const second = filterTechUserId ? await retry.eq("user_id", filterTechUserId) : await retry;
    techs = second.data as typeof techs;
    techErr = second.error;
  }
  if (techErr) throw new Error(techErr.message);

  let stopQuery = db
    .from("tech_route_stops")
    .select("tech_user_id, outage_id, sort_order")
    .order("sort_order", { ascending: true });

  if (filterTechUserId) {
    stopQuery = stopQuery.eq("tech_user_id", filterTechUserId);
  }

  const { data: stops, error: stopErr } = await stopQuery;
  if (stopErr) {
    // Table may not exist yet
    if (/tech_route_stops|does not exist|schema cache/i.test(stopErr.message)) {
      return (techs ?? []).map((t, i) => {
        const routeControl = parseRouteControl(
          (t as { route_control?: unknown }).route_control ?? fallbackControl[t.user_id]
        );
        const hasGps = isValidMapCoordinate(t.current_lat, t.current_lng);
        return {
          techUserId: t.user_id,
          techName: (t.users as { name?: string } | null)?.name ?? "Technician",
          mapColor: t.map_color ?? defaultTruckColor(i),
          status: t.status,
          lat: t.current_lat,
          lng: t.current_lng,
          routeControl,
          assignmentNote: assignmentNoteFor({
            status: t.status,
            routeControl,
            hasGps,
            stopCount: 0,
          }),
          stops: [],
        };
      });
    }
    throw new Error(stopErr.message);
  }

  const outageIds = [...new Set((stops ?? []).map((s) => s.outage_id))];
  const outageMap = new Map<
    string,
    {
      id: string;
      lat: number | null;
      lng: number | null;
      street_address: string | null;
      customers: number | null;
      source: string | null;
      status: string;
      customer_name: string | null;
      customer_phone: string | null;
      priority_score: number | null;
    }
  >();

  if (outageIds.length > 0) {
    const { data: outages } = await db
      .from("outages")
      .select(
        "id, lat, lng, street_address, customers, source, status, cause, outage_type, customer_name, customer_phone, priority_score, is_active, is_simulation, investigation_result"
      )
      .in("id", outageIds);
    for (const o of outages ?? []) {
      if (!isRoutingMapVisibleOutage(o, eligibilityCtx)) continue;
      outageMap.set(String(o.id), o);
    }

    if (stops?.length) {
      await purgeIneligibleRouteStops(db, stops, outageMap);
    }
  }

  const stopsByTech = new Map<string, typeof stops>();
  for (const s of stops ?? []) {
    const list = stopsByTech.get(s.tech_user_id) ?? [];
    list.push(s);
    stopsByTech.set(s.tech_user_id, list);
  }

  const techList = [...(techs ?? [])];

  // Mobile/field users must still see their stops even if a technicians row
  // was never created (common for older accounts).
  if (filterTechUserId && !techList.some((t) => t.user_id === filterTechUserId)) {
    const { data: userRow } = await db
      .from("users")
      .select("id, name")
      .eq("id", filterTechUserId)
      .maybeSingle();
    techList.push({
      user_id: filterTechUserId,
      status: "available",
      current_lat: null,
      current_lng: null,
      map_color: null,
      territory_id: null,
      route_control: fallbackControl[filterTechUserId] ?? "manual",
      users: userRow
        ? { id: userRow.id, name: userRow.name }
        : { id: filterTechUserId, name: "Technician" },
    } as unknown as (typeof techList)[number]);
  }

  return techList.map((t, i) => {
    const routeControl = parseRouteControl(
      (t as { route_control?: unknown }).route_control ?? fallbackControl[t.user_id]
    );
    const techStops = (stopsByTech.get(t.user_id) ?? [])
      .map((s) => {
        const o = outageMap.get(String(s.outage_id));
        if (!o || o.lat == null || o.lng == null) return null;
        return {
          outageId: String(s.outage_id),
          sortOrder: s.sort_order,
          lat: o.lat,
          lng: o.lng,
          address: o.street_address ?? null,
          customers: o.customers ?? 0,
          source: o.source ?? null,
          status: o.status ?? "unvisited",
          customerName: o.customer_name ?? null,
          customerPhone: o.customer_phone ?? null,
          priorityScore: o.priority_score ?? 0,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s != null);

    return {
      techUserId: t.user_id,
      techName: (t.users as { name?: string } | null)?.name ?? "Technician",
      mapColor: t.map_color ?? defaultTruckColor(i),
      status: t.status,
      lat: t.current_lat,
      lng: t.current_lng,
      routeControl,
      assignmentNote: assignmentNoteFor({
        status: t.status,
        routeControl,
        hasGps: isValidMapCoordinate(t.current_lat, t.current_lng),
        stopCount: techStops.length,
      }),
      stops: techStops,
    };
  });
}

async function mirrorAssignment(
  db: ReturnType<typeof getAdmin>,
  outageId: string,
  techUserId: string | null,
  techName: string | null
) {
  const now = new Date().toISOString();
  await db
    .from("outages")
    .update({
      assigned_tech_name: techName,
      last_updated_at: now,
    })
    .eq("id", outageId);

  if (String(outageId).startsWith("office-")) {
    const jobId = String(outageId).slice("office-".length);
    await db
      .from("jobs")
      .update({
        assigned_tech_id: techUserId,
        updated_at: now,
      })
      .eq("id", jobId);
  }
}

export async function GET(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload: { sub: string; role: string };
    try {
      payload = verifyJWT(token) as { sub: string; role: string };
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (!isSupabaseConfigured) return NextResponse.json({ routes: [] });

    const db = getAdmin();
    const filter = canManage(payload.role) ? null : payload.sub;
    const routes = await loadRouteBundles(db, filter);
    return NextResponse.json({ routes });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to load routes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload: { sub: string; role: string; name?: string };
    try {
      payload = verifyJWT(token) as { sub: string; role: string; name?: string };
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();
    const action = String(body.action || "");
    if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });

    const db = getAdmin();
    const office = canManage(payload.role);

    if (action === "not_target") {
      const outageId = String(body.outageId || "");
      if (!outageId) return NextResponse.json({ error: "outageId required" }, { status: 400 });

      const { data: outageRow } = await db
        .from("outages")
        .select("id, lat, lng, street_address")
        .eq("id", outageId)
        .maybeSingle();

      await db
        .from("outages")
        .update({
          status: "no_opportunity",
          last_updated_at: new Date().toISOString(),
          office_notes: "Marked not a target property from Routing Logic",
        })
        .eq("id", outageId);

      await db.from("tech_route_stops").delete().eq("outage_id", outageId);

      // Persist to permanent excluded-properties list when coords exist
      if (
        outageRow &&
        outageRow.lat != null &&
        outageRow.lng != null &&
        Number.isFinite(Number(outageRow.lat)) &&
        Number.isFinite(Number(outageRow.lng))
      ) {
        const { normalizeAddressKey } = await import("@/lib/address-match");
        const address = outageRow.street_address || null;
        await db.from("excluded_properties").insert({
          address,
          address_key: address ? normalizeAddressKey(address) : null,
          lat: Number(outageRow.lat),
          lng: Number(outageRow.lng),
          radius_meters: 30,
          reason: "Not a target property",
          source: "investigation",
          notes: `From outage ${outageId}`,
          created_by: payload.name || payload.sub || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        });
      }

      return NextResponse.json({ success: true });
    }

    if (action === "set_route_control") {
      const techUserId = String(body.techUserId || "");
      if (!techUserId) return NextResponse.json({ error: "techUserId required" }, { status: 400 });
      if (!office && techUserId !== payload.sub) {
        return NextResponse.json({ error: "Can only change your own routing mode" }, { status: 403 });
      }
      const control = parseRouteControl(body.routeControl ?? body.mode);
      await saveRouteControl(db, techUserId, control);
      const routes = await loadRouteBundles(db, office ? null : techUserId);
      return NextResponse.json({ success: true, routes, routeControl: control });
    }

    if (action === "auto_populate") {
      if (!office) return NextResponse.json({ error: "Office role required" }, { status: 403 });
      const maxStops = Math.max(1, Math.min(Number(body.maxStopsPerTech ?? 10), 15));
      const fallbackControl = await loadRouteControlFallback(db);

      let techSel = await db
        .from("technicians")
        .select("user_id, status, current_lat, current_lng, map_color, route_control, territory_id, users(name)");
      if (techSel.error && /route_control|schema cache|does not exist/i.test(techSel.error.message)) {
        techSel = await db
          .from("technicians")
          .select("user_id, status, current_lat, current_lng, map_color, territory_id, users(name)");
      }
      if (techSel.error) return NextResponse.json({ error: techSel.error.message }, { status: 500 });

      const { data: territories } = await db
        .from("territories")
        .select("id, zip_codes, geometry");
      const territoryById = new Map((territories ?? []).map((t) => [t.id, t]));

      const allTechs = techsWithOrigin(
        (techSel.data ?? []).map((t) => ({
          ...t,
          route_control: parseRouteControl(
            (t as { route_control?: unknown }).route_control ?? fallbackControl[t.user_id]
          ),
        })),
        territoryById
      );

      // Only AUTO techs are rebuilt. MANUAL techs keep their string route.
      const autoTechs = allTechs.filter((t) => t.routeControl === "auto" && t.status !== "offline");
      for (const tech of autoTechs) {
        await db.from("tech_route_stops").delete().eq("tech_user_id", tech.user_id);
      }

      const { data: simSetting } = await db
        .from("app_settings")
        .select("value")
        .eq("key", "simulation_mode")
        .maybeSingle();
      const isSim = simSetting?.value === true || simSetting?.value === "true";

      let outageQuery = db
        .from("outages")
        .select(
          "id, lat, lng, street_address, customers, source, status, cause, outage_type, priority_score, assigned_tech_name, is_simulation, is_active"
        )
        .eq("is_active", true)
        .in("status", [
          "unvisited",
          "investigating",
          "sold",
          "wants_to_proceed",
          "temp_power",
          "grounding",
          "opportunity",
        ]);

      outageQuery = isSim
        ? outageQuery.eq("is_simulation", true)
        : outageQuery.or("is_simulation.is.null,is_simulation.eq.false");

      const { data: outages } = await outageQuery;

      const { data: existing } = await db.from("tech_route_stops").select("outage_id, tech_user_id");
      const claimed = new Set((existing ?? []).map((e) => String(e.outage_id)));

      const autoEligibilityCtx = await loadMapEligibilityContext(db);
      const pool = (outages ?? []).filter(
        (o) => isRoutingMapVisibleOutage(o, autoEligibilityCtx) && !claimed.has(String(o.id))
      );

      const sortedTechs = [...autoTechs].filter((t) => t.origin).sort((a, b) => {
        const nearA = pool.filter(
          (o) => haversineMiles(a.origin!.lat, a.origin!.lng, o.lat!, o.lng!) <= 10
        ).length;
        const nearB = pool.filter(
          (o) => haversineMiles(b.origin!.lat, b.origin!.lng, o.lat!, o.lng!) <= 10
        ).length;
        return nearB - nearA;
      });

      const stillAvailable = [...pool];
      const now = new Date().toISOString();

      for (const tech of sortedTechs) {
        if (stillAvailable.length === 0) break;
        const picks = rankCandidatesForTech(
          tech.origin!,
          stillAvailable.map((o) => ({
            id: o.id,
            lat: o.lat!,
            lng: o.lng!,
            status: o.status,
            customers: Math.max(1, o.customers ?? 1),
            priorityScore: o.priority_score ?? 0,
            source: o.source,
          })),
          maxStops
        );

        const pickIds = new Set(picks.map((p) => String(p.id)));
        for (let i = stillAvailable.length - 1; i >= 0; i--) {
          if (pickIds.has(String(stillAvailable[i].id))) stillAvailable.splice(i, 1);
        }

        const techName = (tech.users as { name?: string } | null)?.name ?? "Technician";
        for (let i = 0; i < picks.length; i++) {
          const oid = String(picks[i].id);
          await db.from("tech_route_stops").upsert(
            {
              tech_user_id: tech.user_id,
              outage_id: oid,
              sort_order: (i + 1) * 10,
              updated_at: now,
            },
            { onConflict: "tech_user_id,outage_id" }
          );
          await mirrorAssignment(db, oid, tech.user_id, techName);
        }
      }

      const routes = await loadRouteBundles(db);
      return NextResponse.json({ success: true, routes });
    }

    const techUserId = String(body.techUserId || "");
    if (!techUserId) return NextResponse.json({ error: "techUserId required" }, { status: 400 });
    if (!office && techUserId !== payload.sub) {
      return NextResponse.json({ error: "Can only edit your own route" }, { status: 403 });
    }

    const { data: techUser } = await db.from("users").select("name").eq("id", techUserId).maybeSingle();
    const techName = techUser?.name ?? "Technician";
    const now = new Date().toISOString();

    if (action === "add") {
      const outageId = String(body.outageId || "");
      if (!outageId) return NextResponse.json({ error: "outageId required" }, { status: 400 });

      // Client may send lat/lng from the live map (ArcGIS dots often appear
      // before the background upsert finishes — or DB coords can be stale/null).
      const clientLat = body.lat != null ? Number(body.lat) : null;
      const clientLng = body.lng != null ? Number(body.lng) : null;
      const clientAddress =
        typeof body.streetAddress === "string"
          ? body.streetAddress
          : typeof body.address === "string"
            ? body.address
            : null;
      const clientSource =
        typeof body.source === "string" && body.source.trim()
          ? body.source.trim()
          : "xcel";
      const clientStatus =
        typeof body.status === "string" && body.status.trim()
          ? body.status.trim()
          : "unvisited";
      const clientCustomers = Math.max(1, Number(body.customers) || 1);

      const addEligibilityCtx = await loadMapEligibilityContext(db);
      let { data: target } = await db
        .from("outages")
        .select(
          "id, lat, lng, street_address, customers, source, status, cause, outage_type, is_active, is_simulation, investigation_result"
        )
        .eq("id", outageId)
        .maybeSingle();

      // Ensure the DB row exists with usable coordinates when the map already shows the pin.
      if (!target || !isValidMapCoordinate(target.lat, target.lng)) {
        if (!isValidMapCoordinate(clientLat, clientLng)) {
          return NextResponse.json(
            {
              error: target
                ? `Outage ${outageId} is in the database but has no usable GPS coordinates. Re-open the map and try again.`
                : `Outage ${outageId} is not saved yet and no map coordinates were sent — refresh the map and try again.`,
            },
            { status: 400 }
          );
        }

        const upsertRow: Record<string, unknown> = {
          id: outageId,
          lat: clientLat,
          lng: clientLng,
          street_address: clientAddress || target?.street_address || null,
          customers: target?.customers ?? clientCustomers,
          source: target?.source || clientSource,
          status: target?.status || clientStatus,
          is_active: true,
          last_updated_at: now,
        };
        if (!target) {
          upsertRow.first_seen_at = now;
        }

        const { error: upsertErr } = await db.from("outages").upsert(upsertRow, {
          onConflict: "id",
          ignoreDuplicates: false,
        });
        if (upsertErr) {
          return NextResponse.json(
            { error: `Could not save outage for routing: ${upsertErr.message}` },
            { status: 500 }
          );
        }

        const reload = await db
          .from("outages")
          .select(
            "id, lat, lng, street_address, customers, source, status, cause, outage_type, is_active, is_simulation, investigation_result"
          )
          .eq("id", outageId)
          .maybeSingle();
        target = reload.data;
      }

      if (!target) {
        return NextResponse.json(
          { error: `Outage ${outageId} not found — cannot add to route` },
          { status: 400 }
        );
      }
      if (!isValidMapCoordinate(target.lat, target.lng)) {
        return NextResponse.json(
          {
            error: `Outage ${outageId} still has invalid coordinates after sync (lat: ${target.lat}, lng: ${target.lng})`,
          },
          { status: 400 }
        );
      }
      if (!isRoutingMapVisibleOutage(target, addEligibilityCtx)) {
        return NextResponse.json(
          { error: "That location is not an eligible map marker (planned, hidden, or excluded)" },
          { status: 400 }
        );
      }

      // Manual add takes this technician off automatic routing without touching anyone else.
      await saveRouteControl(db, techUserId, "manual");

      // Remove from any other tech route first (no duplicates)
      await db.from("tech_route_stops").delete().eq("outage_id", outageId);

      const maxStops = office ? 20 : 5;
      const { data: existingRows } = await db
        .from("tech_route_stops")
        .select("outage_id, sort_order")
        .eq("tech_user_id", techUserId)
        .order("sort_order", { ascending: true });

      const existingIds = (existingRows ?? []).map((r) => String(r.outage_id)).filter((id) => id !== outageId);
      if (existingIds.length >= maxStops && !office) {
        return NextResponse.json(
          { error: `Technicians can set up to ${maxStops} next stops` },
          { status: 400 }
        );
      }

      const existingDetails: Array<{ id: string; lat: number; lng: number }> = [];
      if (existingIds.length > 0) {
        const { data: existingOutages } = await db
          .from("outages")
          .select("id, lat, lng")
          .in("id", existingIds);
        const byId = new Map((existingOutages ?? []).map((o) => [String(o.id), o]));
        for (const id of existingIds) {
          const o = byId.get(id);
          if (o && isValidMapCoordinate(o.lat, o.lng)) {
            existingDetails.push({ id, lat: Number(o.lat), lng: Number(o.lng) });
          }
        }
      }

      const { data: techLoc } = await db
        .from("technicians")
        .select("current_lat, current_lng")
        .eq("user_id", techUserId)
        .maybeSingle();

      const start =
        techLoc && isValidMapCoordinate(techLoc.current_lat, techLoc.current_lng)
          ? { lat: Number(techLoc.current_lat), lng: Number(techLoc.current_lng) }
          : null;

      const ordered = insertStopInSpatialOrder(start, existingDetails, {
        id: outageId,
        lat: Number(target.lat),
        lng: Number(target.lng),
      }).slice(0, maxStops);

      await db.from("tech_route_stops").delete().eq("tech_user_id", techUserId);
      for (let i = 0; i < ordered.length; i++) {
        const oid = ordered[i].id;
        await db.from("tech_route_stops").delete().eq("outage_id", oid);
        await db.from("tech_route_stops").insert({
          tech_user_id: techUserId,
          outage_id: oid,
          sort_order: (i + 1) * 10,
          updated_at: now,
        });
        await mirrorAssignment(db, oid, techUserId, techName);
      }

      const routes = await loadRouteBundles(db, office ? null : techUserId);
      return NextResponse.json({ success: true, routes });
    }

    if (action === "remove") {
      const outageId = String(body.outageId || "");
      if (!outageId) return NextResponse.json({ error: "outageId required" }, { status: 400 });

      await db
        .from("tech_route_stops")
        .delete()
        .eq("tech_user_id", techUserId)
        .eq("outage_id", outageId);

      await mirrorAssignment(db, outageId, null, null);
      const routes = await loadRouteBundles(db, office ? null : techUserId);
      return NextResponse.json({ success: true, routes });
    }

    if (action === "clear") {
      const { data: prior, error: priorErr } = await db
        .from("tech_route_stops")
        .select("outage_id")
        .eq("tech_user_id", techUserId);
      if (priorErr) {
        return NextResponse.json({ error: priorErr.message }, { status: 500 });
      }

      const { error: delErr } = await db
        .from("tech_route_stops")
        .delete()
        .eq("tech_user_id", techUserId);
      if (delErr) {
        return NextResponse.json(
          { error: `Failed to clear route: ${delErr.message}` },
          { status: 500 }
        );
      }

      for (const row of prior ?? []) {
        await mirrorAssignment(db, String(row.outage_id), null, null);
      }

      // Confirm zero stops remain for this tech.
      const { data: leftover, error: leftErr } = await db
        .from("tech_route_stops")
        .select("outage_id")
        .eq("tech_user_id", techUserId);
      if (leftErr) {
        return NextResponse.json({ error: leftErr.message }, { status: 500 });
      }
      if ((leftover ?? []).length > 0) {
        // Retry hard delete once.
        await db.from("tech_route_stops").delete().eq("tech_user_id", techUserId);
      }

      const routes = await loadRouteBundles(db, office ? null : techUserId);
      const mine = routes.find((r) => r.techUserId === techUserId);
      return NextResponse.json({
        success: true,
        routes,
        cleared: true,
        remainingStops: mine?.stops?.length ?? 0,
      });
    }

    if (action === "reorder" || action === "set_stops") {
      const orderedOutageIds: string[] = Array.isArray(body.orderedOutageIds)
        ? body.orderedOutageIds.map(String)
        : Array.isArray(body.outageIds)
          ? body.outageIds.map(String)
          : [];

      if (!orderedOutageIds.length && action === "reorder") {
        return NextResponse.json({ error: "orderedOutageIds required" }, { status: 400 });
      }

      const maxStops = office ? 20 : 5;
      const limited = orderedOutageIds.slice(0, maxStops);

      const { data: prior } = await db
        .from("tech_route_stops")
        .select("outage_id")
        .eq("tech_user_id", techUserId);

      await db.from("tech_route_stops").delete().eq("tech_user_id", techUserId);

      // Clear assignment for removed stops
      const keep = new Set(limited);
      for (const row of prior ?? []) {
        if (!keep.has(String(row.outage_id))) {
          await mirrorAssignment(db, String(row.outage_id), null, null);
        }
      }

      for (let i = 0; i < limited.length; i++) {
        const oid = limited[i];
        // Ensure uniqueness across techs
        await db.from("tech_route_stops").delete().eq("outage_id", oid);
        await db.from("tech_route_stops").insert({
          tech_user_id: techUserId,
          outage_id: oid,
          sort_order: (i + 1) * 10,
          updated_at: now,
        });
        await mirrorAssignment(db, oid, techUserId, techName);
      }

      const routes = await loadRouteBundles(db, office ? null : techUserId);
      return NextResponse.json({ success: true, routes });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Route update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
