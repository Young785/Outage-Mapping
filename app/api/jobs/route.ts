/**
 * GET  /api/jobs  — list all jobs (office-created + outage-derived)
 * POST /api/jobs  — create a new office job
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";
import { forwardGeocode } from "@/lib/geocache";
import { calculateScore, getWeights } from "@/lib/priority";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const techId = searchParams.get("techId");

  if (!isSupabaseConfigured) return NextResponse.json({ jobs: [] });

  try {
    const db = getAdmin();
    let query = db
      .from("jobs")
      .select("*, assigned_tech:users!assigned_tech_id(name, email), created_by_user:users!created_by(name)")
      .order("priority_score", { ascending: false });

    if (status) query = query.eq("status", status);
    if (techId) query = query.eq("assigned_tech_id", techId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ jobs: data ?? [] });
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

    if (payload.role !== "office" && payload.role !== "admin" && payload.role !== "owner") {
      return NextResponse.json({ error: "Office role required to create jobs" }, { status: 403 });
    }

    const body = await req.json();
    const {
      customerName,
      customerAddress,
      customerPhone,
      customerLat,
      customerLng,
      jobType = "repair",
      priority = 2,
      notes,
      isConfirmedOpportunity = true,
      outageId,
      lineDrop = false,
      powerOnLineDrop = false,
    } = body;

    if (!customerName || !customerAddress) {
      return NextResponse.json({ error: "customerName and customerAddress are required" }, { status: 400 });
    }

    // Forward-geocode address → lat/lng so the job appears on the map and can be dispatched
    let lat = customerLat;
    let lng = customerLng;
    if ((!lat || !lng) && customerAddress) {
      try {
        const geo = await forwardGeocode(customerAddress);
        if (geo) { lat = geo.lat; lng = geo.lng; }
      } catch {
        // Non-fatal — job is still created without coordinates
      }
    }

    const weights = await getWeights();
    const score = calculateScore({
      customers: 1,
      outageType: jobType,
      isOfficeJob: true,
      isConfirmedOpportunity,
      lineDrop,
      powerOnLineDrop,
      wantsToProceed: isConfirmedOpportunity,
    }, weights);

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, stored: false });
    }

    const db = getAdmin();
    const { data: job, error } = await db
      .from("jobs")
      .insert({
        source: "office",
        outage_id: outageId || null,
        customer_name: customerName,
        customer_address: customerAddress,
        customer_phone: customerPhone || null,
        customer_lat: lat || null,
        customer_lng: lng || null,
        job_type: jobType,
        priority: Math.min(4, Math.max(1, Number(priority))),
        notes: notes || null,
        status: "pending",
        is_confirmed_opportunity: isConfirmedOpportunity,
        priority_score: score,
        created_by: payload.sub,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Mirror office call-in leads into outages so they appear as triangle markers on map.
    if (lat && lng) {
      const fullOfficeRow: Record<string, any> = {
        id: `office-${job.id}`,
        source: "office",
        lat,
        lng,
        city: null,
        county: "Unknown",
        customers: 1,
        outage_type: "Office Call-in Lead",
        cause: notes || "Office-entered lead",
        status: "unvisited",
        street_address: customerAddress,
        customer_name: customerName ?? null,
        customer_phone: customerPhone ?? null,
        lead_source: "office",
        priority_score: score,
        is_active: true,
        first_seen_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      };
      // Backward-compat: older Supabase schemas (pre-006/007) may be missing
      // optional columns. Detect "Could not find the 'X' column" errors and
      // strip those columns dynamically. Also try alternate `source` values
      // in case the CHECK constraint rejects "office".
      const droppable = new Set([
        "lead_source",
        "customer_name",
        "customer_phone",
        "priority_score",
        "is_active",
        "first_seen_at",
        "last_updated_at",
        "outage_type",
        "street_address",
      ]);
      const sourceCandidates = ["office", "manual", "user"];
      const dropped = new Set<string>();
      const buildOfficeRow = (src: string) => {
        const row: Record<string, any> = { ...fullOfficeRow, source: src };
        for (const col of dropped) delete row[col];
        return row;
      };
      let officeMirrored = false;
      for (const src of sourceCandidates) {
        for (let i = 0; i < droppable.size + 1; i++) {
          const { error: e } = await db.from("outages").upsert(buildOfficeRow(src));
          if (!e) { officeMirrored = true; break; }
          const m = String(e.message || "").match(/Could not find the '([^']+)' column/);
          if (m && droppable.has(m[1]) && !dropped.has(m[1])) {
            dropped.add(m[1]);
            continue;
          }
          break;
        }
        if (officeMirrored) break;
      }
      // Office mirror is best-effort. The job itself was already saved above,
      // so we don't fail the whole request if the mirror upsert never lands —
      // the map will fall back to synthesising the triangle from the job row.
    }

    return NextResponse.json({ success: true, job });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
