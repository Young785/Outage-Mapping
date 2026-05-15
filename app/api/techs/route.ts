/**
 * GET  /api/techs        — list all technicians with user info + live status
 * POST /api/techs        — update own tech status/location (tech calls this)
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";

export async function GET() {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ techs: [] });
  }

  try {
    const db = getAdmin();
    const { data, error } = await db
      .from("technicians")
      .select("*, users(id, name, email, phone, role), territories(id, name)")
      .order("updated_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fetch current job titles in one query if any techs have current_job_id
    const jobIds = (data ?? []).map((t) => t.current_job_id).filter(Boolean);
    let jobMap: Record<string, string> = {};
    if (jobIds.length > 0) {
      const { data: jobs } = await db
        .from("jobs")
        .select("id, customer_name, address")
        .in("id", jobIds);
      for (const j of jobs ?? []) {
        jobMap[j.id] = j.customer_name ?? j.address ?? "Job";
      }
    }

    const techs = (data ?? []).map((t) => ({
      id: t.id,
      userId: t.user_id,
      name: (t.users as any)?.name ?? "Unknown",
      email: (t.users as any)?.email ?? null,
      phone: (t.users as any)?.phone ?? null,
      status: t.status,
      lat: t.current_lat,
      lng: t.current_lng,
      currentJobId: t.current_job_id,
      currentJobName: t.current_job_id ? (jobMap[t.current_job_id] ?? "Active Job") : null,
      territoryId: t.territory_id,
      territoryName: (t.territories as any)?.name ?? null,
      workingSince: t.working_since ?? null,
      completedCount: t.completed_count ?? 0,
      returnTripCount: t.return_trip_count ?? 0,
      updatedAt: t.updated_at,
    }));

    return NextResponse.json({ techs });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try { payload = verifyJWT(token); } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const body = await req.json();
    const { action, status, lat, lng, techId, territoryId } = body;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, stored: false });
    }

    const db = getAdmin();

    // Office/admin can assign territory to any tech
    if (action === "assign_territory") {
      if (payload.role !== "office" && payload.role !== "admin") {
        return NextResponse.json({ error: "Office role required to assign territories" }, { status: 403 });
      }
      if (!techId) return NextResponse.json({ error: "techId required" }, { status: 400 });
      const { error } = await db
        .from("technicians")
        .update({ territory_id: territoryId ?? null, updated_at: new Date().toISOString() })
        .eq("user_id", techId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // Tech updates own status / location
    const validStatuses = ["available", "working", "paused", "offline"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { completionChoice } = body;

    const update: any = { updated_at: new Date().toISOString() };
    if (status) update.status = status;
    if (lat != null) update.current_lat = lat;
    if (lng != null) update.current_lng = lng;

    // Track when tech starts working
    if (status === "working") {
      update.working_since = new Date().toISOString();
    }
    // Clear working_since when no longer working
    if (status === "available" || status === "paused" || status === "offline") {
      update.working_since = null;
    }
    // Increment completed_count or return_trip_count based on completion choice
    if (completionChoice === "complete") {
      const { data: techRow } = await db
        .from("technicians")
        .select("completed_count")
        .eq("user_id", payload.sub)
        .maybeSingle();
      update.completed_count = (techRow?.completed_count ?? 0) + 1;
      update.current_job_id = null;
    } else if (["temp_power", "return_grounding", "return_permanent"].includes(completionChoice ?? "")) {
      // Return trips: increment return_trip_count
      const { data: techRow } = await db
        .from("technicians")
        .select("return_trip_count")
        .eq("user_id", payload.sub)
        .maybeSingle();
      update.return_trip_count = (techRow?.return_trip_count ?? 0) + 1;
    }

    const { error } = await db
      .from("technicians")
      .update(update)
      .eq("user_id", payload.sub);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
