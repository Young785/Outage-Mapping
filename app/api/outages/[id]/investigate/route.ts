/**
 * POST /api/outages/[id]/investigate
 * Submit a field investigation form for an outage.
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";

/** Supabase / PostgREST error when INSERT references columns not in DB yet */
function looksLikeMissingColumn(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("could not find") ||
    m.includes("schema cache") ||
    m.includes("column") ||
    m.includes("does not exist")
  );
}

/** DB CHECK constraint error (e.g. outages.source must be one of N values). */
function looksLikeCheckConstraint(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("violates check constraint") || m.includes("check constraint");
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: outageId } = await params;
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try { payload = verifyJWT(token); } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const body = await req.json();
    const {
      // Legacy fields (kept for backward compat)
      faultType,
      causeConfirmed,
      damageDescription,
      actionTaken,
      photos = [],
      // New structured fields (§6)
      investigationResult,
      customersAffected,
      customerHasPower,
      lineDrop,
      powerOnLineDrop,
      lineDropDamaged,
      honeyHole,
      honeyHoleHomes,
      serviceType,
      contactOutcome,
      customerIntent,
      followUpStatus,
      farmBoxNeeded,
      panelReplacementNeeded,
      difficultJob,
      estimatedTimeHours,
      techsRequired,
      // Status override from the client (already derived)
      newStatus,
      notes,
    } = body;

    // Determine the marker status to set
    const validStatuses = [
      "unvisited", "investigating", "no_opportunity", "opportunity",
      "door_hanger", "wants_to_proceed", "customer_thinking", "sold",
      "job_started", "temp_power", "grounding", "completed",
    ];
    const statusToSet = (newStatus && validStatuses.includes(newStatus))
      ? newStatus
      : "investigating";

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, stored: false, newStatus: statusToSet });
    }

    const db = getAdmin();

    // ── Ensure parent outage row exists ────────────────────────────────────
    // The investigations.outage_id FK requires the parent row. For
    // office-synthesized markers (id = "office-<jobId>") the parent only
    // exists in-memory until someone investigates, so we insert it here.
    //
    // We also handle two backward-compat cases:
    //   1. Migration 007 columns (lead_source / customer_name / customer_phone)
    //      may be missing → strip and retry.
    //   2. outages.source CHECK may not include "office" (pre-007) → fall back
    //      to "manual" while keeping lead_source if the column exists.
    const isOfficeSynthesized = String(outageId).startsWith("office-");

    // Check if the row already exists to skip work entirely.
    const { data: existingOutage } = await db
      .from("outages")
      .select("id")
      .eq("id", outageId)
      .maybeSingle();

    if (!existingOutage) {
      let officeJob: any = null;
      if (isOfficeSynthesized) {
        const jobId = String(outageId).slice("office-".length);
        const { data } = await db
          .from("jobs")
          .select("customer_name, customer_address, customer_phone, customer_lat, customer_lng, notes, priority_score, created_at")
          .eq("id", jobId)
          .maybeSingle();
        officeJob = data;
      }

      // Build progressively-stripped variants. We must always include lat/lng
      // for office synthesized rows or the row itself is meaningless on map.
      const baseCommon: Record<string, unknown> = {
        id: outageId,
        status: "investigating",
        last_updated_at: new Date().toISOString(),
        is_active: true,
        county: "Unknown",
        customers: 1,
        outage_type: isOfficeSynthesized ? "Office Call-in Lead" : "Field Investigation",
        first_seen_at: new Date().toISOString(),
        priority_score: 0,
      };
      if (isOfficeSynthesized && officeJob) {
        baseCommon.lat = officeJob.customer_lat;
        baseCommon.lng = officeJob.customer_lng;
        baseCommon.cause = officeJob.notes ?? "Office-entered lead";
        baseCommon.street_address = officeJob.customer_address ?? null;
        baseCommon.first_seen_at = officeJob.created_at ?? new Date().toISOString();
        baseCommon.priority_score = officeJob.priority_score ?? 0;
      }

      // Variants ordered most-detailed → most-conservative
      const sourceCandidates = isOfficeSynthesized
        ? ["office", "manual", "user"]
        : ["xcel", "manual"];

      const m007Extras = isOfficeSynthesized && officeJob
        ? {
            customer_name: officeJob.customer_name ?? null,
            customer_phone: officeJob.customer_phone ?? null,
            lead_source: "office" as const,
          }
        : isOfficeSynthesized
          ? { lead_source: "office" as const }
          : {};

      let inserted = false;
      let lastErr: { message?: string } | null = null;

      outer: for (const src of sourceCandidates) {
        for (const includeM007 of [true, false]) {
          const row: Record<string, unknown> = {
            ...baseCommon,
            source: src,
            ...(includeM007 ? m007Extras : {}),
          };
          // Skip variants without lat/lng if synthesized job lookup failed —
          // outages.lat/lng are NOT NULL in 001 schema.
          if (row.lat == null || row.lng == null) continue;
          const ins = await db.from("outages").insert(row);
          if (!ins.error) { inserted = true; break outer; }
          lastErr = ins.error;
          // If the error is anything other than missing column / CHECK,
          // bail out — we won't fix it by trying smaller payloads.
          if (
            !looksLikeMissingColumn(ins.error.message) &&
            !looksLikeCheckConstraint(ins.error.message)
          ) {
            break outer;
          }
        }
      }

      if (!inserted) {
        return NextResponse.json(
          {
            error:
              "Could not create the parent outage row for this investigation. " +
              "Likely DB schema is behind. Last error: " +
              (lastErr?.message ?? "unknown"),
          },
          { status: 500 }
        );
      }
    }

    const visitedAt = new Date().toISOString();

    // When DB is behind migration 006 (or PostgREST cache is stale), structured
    // columns may not exist. Retry with smaller payloads; stash extras in notes.
    const metaBlob = [
      investigationResult && `investigation_result=${investigationResult}`,
      followUpStatus && `follow_up=${followUpStatus}`,
      customersAffected != null && `customers_affected=${customersAffected}`,
      customerHasPower != null && `customer_has_power=${customerHasPower}`,
      lineDrop != null && `line_drop=${lineDrop}`,
      powerOnLineDrop != null && `power_on_line_drop=${powerOnLineDrop}`,
      lineDropDamaged != null && `line_drop_damaged=${lineDropDamaged}`,
      honeyHole != null && `honey_hole=${honeyHole}`,
      honeyHoleHomes != null && honeyHoleHomes !== "" && `honey_hole_homes=${honeyHoleHomes}`,
      serviceType && `service_type=${serviceType}`,
      contactOutcome && `contact_outcome=${contactOutcome}`,
      customerIntent && `customer_intent=${customerIntent}`,
      farmBoxNeeded != null && `farm_box=${farmBoxNeeded}`,
      panelReplacementNeeded != null && `panel_replace=${panelReplacementNeeded}`,
      difficultJob != null && `difficult_job=${difficultJob}`,
      estimatedTimeHours !== "" && estimatedTimeHours != null && `est_hours=${estimatedTimeHours}`,
      techsRequired !== "" && techsRequired != null && `techs=${techsRequired}`,
      newStatus && `derived_status=${newStatus}`,
    ]
      .filter(Boolean)
      .join("; ");

    const notesWithMeta =
      metaBlob.length > 0
        ? [notes?.trim(), `[field_form] ${metaBlob}`].filter(Boolean).join("\n")
        : notes?.trim() || null;

    const legacyBase = {
      outage_id: outageId,
      tech_id: payload.sub,
      fault_type: faultType || null,
      cause_confirmed: causeConfirmed || null,
      damage_description: damageDescription || null,
      action_taken: actionTaken || null,
      photos: Array.isArray(photos) ? photos : [],
      visited_at: visitedAt,
    };

    const rowFull = {
      ...legacyBase,
      notes: notes?.trim() || null,
      investigation_result: investigationResult || null,
      customers_affected: customersAffected ?? null,
      customer_has_power: customerHasPower ?? null,
      line_drop_present: lineDrop ?? false,
      power_on_line_drop: powerOnLineDrop ?? false,
      line_drop_damaged: lineDropDamaged ?? false,
      honey_hole: honeyHole ?? false,
      honey_hole_homes: honeyHoleHomes ?? null,
      service_type: serviceType || null,
      contact_outcome: contactOutcome || null,
      customer_intent: customerIntent || null,
      follow_up_status: followUpStatus || null,
      farm_box_needed: farmBoxNeeded ?? false,
      panel_replacement_needed: panelReplacementNeeded ?? false,
      difficult_job: difficultJob ?? false,
      estimated_time_hours: estimatedTimeHours ?? null,
      techs_required: techsRequired ?? null,
    };

    const rowSans006 = {
      ...legacyBase,
      notes: notes?.trim() || null,
      investigation_result: investigationResult || null,
      customers_affected: customersAffected ?? null,
      customer_has_power: customerHasPower ?? null,
      line_drop_present: lineDrop ?? false,
      power_on_line_drop: powerOnLineDrop ?? false,
      line_drop_damaged: lineDropDamaged ?? false,
      service_type: serviceType || null,
      follow_up_status: followUpStatus || null,
    };

    const rowSans003 = {
      ...legacyBase,
      notes: notesWithMeta,
    };

    let inv: { id: string } | null = null;
    let invErr: { message: string } | null = null;

    for (const candidate of [rowFull, rowSans006, rowSans003]) {
      const res = await db.from("investigations").insert(candidate).select("id").single();
      if (!res.error) {
        inv = res.data as { id: string };
        invErr = null;
        break;
      }
      invErr = res.error;
      if (!looksLikeMissingColumn(res.error.message)) break;
    }

    if (invErr || !inv) {
      return NextResponse.json({ error: invErr?.message ?? "Investigation insert failed" }, { status: 500 });
    }

    // Update outage status + customer count when reported by field tech
    const outageUpdate: Record<string, unknown> = {
      status: statusToSet,
      last_updated_at: new Date().toISOString(),
    };
    if (customersAffected != null && customersAffected > 0) {
      outageUpdate.customers = customersAffected;
    }
    if (honeyHole && honeyHoleHomes != null && honeyHoleHomes > 0) {
      outageUpdate.customers = honeyHoleHomes;
    }

    // Surface update errors instead of swallowing them. If the DB is missing
    // lead_source (migration 007 not applied / PostgREST cache stale), retry
    // without it so the status itself still lands.
    {
      console.log("[investigate] update payload for id=", outageId, "→", outageUpdate);
      const upd = await db.from("outages").update(outageUpdate).eq("id", outageId);
      if (upd.error && /lead_source/.test(upd.error.message ?? "") && "lead_source" in outageUpdate) {
        console.warn("[investigate] lead_source write rejected:", upd.error.message);
        const { lead_source: _drop, ...withoutLeadSource } = outageUpdate;
        const retry = await db.from("outages").update(withoutLeadSource).eq("id", outageId);
        if (retry.error) {
          console.warn("[investigate] outage status update failed:", retry.error.message);
        }
      } else if (upd.error) {
        console.warn("[investigate] outage status update failed:", upd.error.message);
      }
      // Read it back so we can see if lead_source actually landed.
      const { data: rb } = await db.from("outages").select("id, status, source, lead_source").eq("id", outageId).maybeSingle();
      console.log("[investigate] readback for id=", outageId, "→", rb);
    }

    return NextResponse.json({ success: true, investigationId: inv.id, newStatus: statusToSet });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: outageId } = await params;

  if (!isSupabaseConfigured) return NextResponse.json({ investigations: [] });

  try {
    const db = getAdmin();
    const { data, error } = await db
      .from("investigations")
      .select("*, users(name, email)")
      .eq("outage_id", outageId)
      .order("visited_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ investigations: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
