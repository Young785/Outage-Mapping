/**
 * GET  /api/jobs  — list all jobs (office-created + outage-derived)
 * POST /api/jobs  — create a new office job
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";
import { forwardGeocode } from "@/lib/geocache";
import { calculateScore, getWeights } from "@/lib/priority";
import { getActiveStormEvent } from "@/lib/storm-events";
import { findSupersededUtilityMarkers } from "@/lib/address-match";
import { toPriority100 } from "@/lib/score-display";

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
      street,
      city,
      state,
      zip,
      customerPhone,
      customerEmail,
      customerLat,
      customerLng,
      priority = 2,
      notes,
      isConfirmedOpportunity = true,
      outageId,
      lineDrop = false,
      powerOnLineDrop = false,
      neighborhoodDead = false,
      photos = [],
    } = body;

    const composedAddress =
      customerAddress?.trim() ||
      (street && city && state
        ? [street.trim(), city.trim(), state.trim(), zip?.trim()].filter(Boolean).join(", ")
        : "");

    if (!customerName || !composedAddress) {
      return NextResponse.json({ error: "customerName and address (street, city, state) are required" }, { status: 400 });
    }

    const cleanNotes = [
      notes?.trim(),
      neighborhoodDead && "neighborhood_dead=true",
    ]
      .filter(Boolean)
      .join("\n");

    const photoList = Array.isArray(photos)
      ? photos.filter((p: unknown) => typeof p === "string").slice(0, 6)
      : [];

    // Forward-geocode address → lat/lng so the job appears on the map and can be dispatched
    let lat = customerLat;
    let lng = customerLng;
    if ((!lat || !lng) && composedAddress) {
      try {
        const geo = await forwardGeocode(composedAddress);
        if (geo) { lat = geo.lat; lng = geo.lng; }
      } catch {
        // Non-fatal — job is still created without coordinates
      }
    }

    const officeJobType = "repair";

    const weights = await getWeights();
    const rawScore = calculateScore({
      customers: 1,
      outageType: officeJobType,
      isOfficeJob: true,
      isConfirmedOpportunity,
      lineDrop,
      powerOnLineDrop,
      wantsToProceed: isConfirmedOpportunity,
    }, weights);
    const score = toPriority100(rawScore);

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, stored: false });
    }

    const db = getAdmin();
    const { data: creator } = await db
      .from("users")
      .select("id")
      .eq("id", payload.sub)
      .maybeSingle();
    if (!creator) {
      return NextResponse.json(
        { error: "Your session is invalid. Please sign out and sign in again." },
        { status: 401 }
      );
    }

    // Prefer inserting with email/photos; fall back if migration not applied yet.
    const jobBase: Record<string, unknown> = {
      source: "office",
      outage_id: outageId || null,
      customer_name: customerName,
      customer_address: composedAddress,
      customer_phone: customerPhone || null,
      customer_lat: lat || null,
      customer_lng: lng || null,
      job_type: officeJobType,
      priority: Math.min(4, Math.max(1, Number(priority))),
      notes: cleanNotes || null,
      status: "pending",
      is_confirmed_opportunity: isConfirmedOpportunity,
      priority_score: score,
      created_by: creator.id,
    };

    let job: Record<string, any> | null = null;
    let insertError: { message?: string } | null = null;
    {
      const full = await db
        .from("jobs")
        .insert({
          ...jobBase,
          customer_email: customerEmail?.trim() || null,
          photos: photoList,
        })
        .select("*")
        .single();
      if (!full.error) {
        job = full.data;
      } else {
        const missingCol = String(full.error.message || "").match(/Could not find the '([^']+)' column/);
        if (missingCol) {
          const fallback = await db.from("jobs").insert(jobBase).select("*").single();
          job = fallback.data;
          insertError = fallback.error;
          // Keep email in notes if column missing
          if (job && customerEmail?.trim()) {
            await db
              .from("jobs")
              .update({
                notes: [cleanNotes, `email=${customerEmail.trim()}`].filter(Boolean).join("\n") || null,
              })
              .eq("id", job.id);
          }
        } else {
          insertError = full.error;
        }
      }
    }

    if (insertError || !job) {
      return NextResponse.json({ error: insertError?.message || "Failed to create job" }, { status: 500 });
    }

    // Mirror office call-in leads into outages so they appear as triangle markers on map.
    if (lat && lng) {
      const activeStorm = await getActiveStormEvent();
      const fullOfficeRow: Record<string, any> = {
        id: `office-${job.id}`,
        source: "office",
        lat,
        lng,
        county: "Unknown",
        customers: 1,
        outage_type: "Office Call-in Lead",
        cause: cleanNotes || "Office-entered lead",
        status: "unvisited",
        street_address: composedAddress,
        city: city?.trim() || null,
        state: state?.trim() || null,
        zip_code: zip?.trim() || null,
        customer_name: customerName ?? null,
        customer_phone: customerPhone ?? null,
        customer_email: customerEmail?.trim() || null,
        photos: photoList,
        office_notes: cleanNotes || null,
        lead_source: "office",
        priority_score: score,
        is_active: true,
        first_seen_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
        ...(activeStorm ? { storm_event_id: activeStorm.id } : {}),
      };
      // Backward-compat: older Supabase schemas (pre-006/007) may be missing
      // optional columns. Detect "Could not find the 'X' column" errors and
      // strip those columns dynamically. Also try alternate `source` values
      // in case the CHECK constraint rejects "office".
      const droppable = new Set([
        "lead_source",
        "customer_name",
        "customer_phone",
        "customer_email",
        "photos",
        "office_notes",
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

      // Supersede nearby ArcGIS / utility white markers at the same address.
      try {
        const { data: nearby } = await db
          .from("outages")
          .select("id, lat, lng, street_address, source, is_active")
          .eq("is_active", true)
          .in("source", ["xcel", "connexus", "arcgis"]);
        const superseded = findSupersededUtilityMarkers(
          { lat, lng, address: composedAddress },
          nearby ?? []
        );
        if (superseded.length) {
          await db
            .from("outages")
            .update({
              is_active: false,
              office_notes: `Superseded by office call-in office-${job.id}`,
              last_updated_at: new Date().toISOString(),
            })
            .in("id", superseded);
          // Link first superseded utility outage to the job when not already linked
          if (!outageId && superseded[0]) {
            await db.from("jobs").update({ outage_id: superseded[0] }).eq("id", job.id);
          }
        }
      } catch (err) {
        console.warn("[jobs] ArcGIS supersede failed:", err);
      }
    }

    return NextResponse.json({ success: true, job });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
