/**
 * GET  /api/routing/tech-routes — list per-tech ordered routes
 * POST /api/routing/tech-routes — mutate routes (add/remove/reorder/auto_populate/not_target)
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { extractBearerToken, verifyJWT } from "@/lib/jwt";
import { defaultTruckColor, rankCandidatesForTech, type TechRouteBundle } from "@/lib/tech-routes";

function canManage(role: string) {
  return role === "office" || role === "admin" || role === "owner";
}

async function loadRouteBundles(
  db: ReturnType<typeof getAdmin>,
  filterTechUserId?: string | null
): Promise<TechRouteBundle[]> {
  let techQuery = db
    .from("technicians")
    .select("user_id, status, current_lat, current_lng, map_color, users(id, name)")
    .order("updated_at", { ascending: false });

  if (filterTechUserId) {
    techQuery = techQuery.eq("user_id", filterTechUserId);
  }

  const { data: techs, error: techErr } = await techQuery;
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
      return (techs ?? []).map((t, i) => ({
        techUserId: t.user_id,
        techName: (t.users as { name?: string } | null)?.name ?? "Technician",
        mapColor: t.map_color ?? defaultTruckColor(i),
        status: t.status,
        lat: t.current_lat,
        lng: t.current_lng,
        stops: [],
      }));
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
        "id, lat, lng, street_address, customers, source, status, customer_name, customer_phone, priority_score"
      )
      .in("id", outageIds);
    for (const o of outages ?? []) {
      outageMap.set(String(o.id), o);
    }
  }

  const stopsByTech = new Map<string, typeof stops>();
  for (const s of stops ?? []) {
    const list = stopsByTech.get(s.tech_user_id) ?? [];
    list.push(s);
    stopsByTech.set(s.tech_user_id, list);
  }

  return (techs ?? []).map((t, i) => {
    const techStops = (stopsByTech.get(t.user_id) ?? []).map((s) => {
      const o = outageMap.get(String(s.outage_id));
      return {
        outageId: String(s.outage_id),
        sortOrder: s.sort_order,
        lat: o?.lat ?? 0,
        lng: o?.lng ?? 0,
        address: o?.street_address ?? null,
        customers: o?.customers ?? 0,
        source: o?.source ?? null,
        status: o?.status ?? "unvisited",
        customerName: o?.customer_name ?? null,
        customerPhone: o?.customer_phone ?? null,
        priorityScore: o?.priority_score ?? 0,
      };
    }).filter((s) => s.lat !== 0 || s.lng !== 0 || s.address);

    return {
      techUserId: t.user_id,
      techName: (t.users as { name?: string } | null)?.name ?? "Technician",
      mapColor: t.map_color ?? defaultTruckColor(i),
      status: t.status,
      lat: t.current_lat,
      lng: t.current_lng,
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

    if (action === "auto_populate") {
      if (!office) return NextResponse.json({ error: "Office role required" }, { status: 403 });
      const maxStops = Math.max(1, Math.min(Number(body.maxStopsPerTech ?? 10), 15));

      const { data: techs } = await db
        .from("technicians")
        .select("user_id, status, current_lat, current_lng, map_color, users(name)")
        .eq("status", "available")
        .not("current_lat", "is", null)
        .not("current_lng", "is", null);

      const { data: outages } = await db
        .from("outages")
        .select("id, lat, lng, street_address, customers, source, status, priority_score, assigned_tech_name")
        .eq("is_active", true)
        .in("status", ["unvisited", "investigating", "sold", "wants_to_proceed", "temp_power", "grounding", "opportunity"]);

      const { data: existing } = await db.from("tech_route_stops").select("outage_id, tech_user_id");
      const claimed = new Set((existing ?? []).map((e) => String(e.outage_id)));

      const pool = (outages ?? []).filter(
        (o) =>
          o.lat != null &&
          o.lng != null &&
          !claimed.has(String(o.id)) &&
          o.status !== "no_opportunity" &&
          o.status !== "completed"
      );

      const stillAvailable = [...pool];
      const now = new Date().toISOString();

      for (const tech of techs ?? []) {
        if (stillAvailable.length === 0) break;
        const picks = rankCandidatesForTech(
          { lat: tech.current_lat!, lng: tech.current_lng! },
          stillAvailable.map((o) => ({
            id: o.id,
            lat: o.lat!,
            lng: o.lng!,
            status: o.status,
            customers: o.customers ?? 1,
            priorityScore: o.priority_score ?? 0,
            source: o.source,
          })),
          maxStops
        );

        const pickIds = new Set(picks.map((p) => String(p.id)));
        for (let i = stillAvailable.length - 1; i >= 0; i--) {
          if (pickIds.has(String(stillAvailable[i].id))) stillAvailable.splice(i, 1);
        }

        // Clear prior auto route for this tech then rewrite
        await db.from("tech_route_stops").delete().eq("tech_user_id", tech.user_id);

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

      // Remove from any other tech route first (no duplicates)
      await db.from("tech_route_stops").delete().eq("outage_id", outageId);

      const { data: existing } = await db
        .from("tech_route_stops")
        .select("sort_order")
        .eq("tech_user_id", techUserId)
        .order("sort_order", { ascending: false })
        .limit(1);

      const nextOrder = ((existing?.[0]?.sort_order as number | undefined) ?? 0) + 10;
      const maxStops = office ? 20 : 5;
      const { count } = await db
        .from("tech_route_stops")
        .select("*", { count: "exact", head: true })
        .eq("tech_user_id", techUserId);

      if ((count ?? 0) >= maxStops && !office) {
        return NextResponse.json(
          { error: `Technicians can set up to ${maxStops} next stops` },
          { status: 400 }
        );
      }

      const { error } = await db.from("tech_route_stops").upsert(
        {
          tech_user_id: techUserId,
          outage_id: outageId,
          sort_order: nextOrder,
          updated_at: now,
        },
        { onConflict: "tech_user_id,outage_id" }
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      await mirrorAssignment(db, outageId, techUserId, techName);
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
      const { data: prior } = await db
        .from("tech_route_stops")
        .select("outage_id")
        .eq("tech_user_id", techUserId);
      await db.from("tech_route_stops").delete().eq("tech_user_id", techUserId);
      for (const row of prior ?? []) {
        await mirrorAssignment(db, String(row.outage_id), null, null);
      }
      const routes = await loadRouteBundles(db, office ? null : techUserId);
      return NextResponse.json({ success: true, routes });
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
