/**
 * Sync Housecall Pro jobs into outages (map markers) and jobs (queue).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveStormEvent } from "./storm-events";

export function housecallMarkerId(externalJobId: string | number): string {
  return `hcp-${externalJobId}`;
}

export function markerStatusFromHousecall(
  externalStatus: string | null,
  leadSource: string | null
): string {
  const s = (externalStatus ?? "").toLowerCase();
  if (["completed", "closed"].includes(s)) return "completed";
  if (["scheduled", "accepted", "booked"].includes(s)) return "sold";
  if (leadSource === "self_generated") return "opportunity";
  return "unvisited";
}

function queueJobStatus(externalStatus: string | null, markerStatus: string): string {
  const s = (externalStatus ?? "").toLowerCase();
  if (["completed", "closed", "cancelled"].includes(s) || markerStatus === "completed") {
    return "completed";
  }
  if (["in_progress", "started", "on_my_way", "on the way"].some((x) => s.includes(x))) {
    return "in_progress";
  }
  if (["scheduled", "accepted", "booked", "assigned"].some((x) => s.includes(x))) {
    return "assigned";
  }
  return "pending";
}

export type HousecallIntakeInput = {
  externalJobId: string;
  leadSource: string | null;
  externalStatus: string;
  markerStatus: string;
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  assignedTechName: string | null;
  notes: string | null;
};

/** Upsert map marker + job queue row for a Housecall intake. */
export async function syncHousecallIntake(
  db: SupabaseClient,
  input: HousecallIntakeInput
): Promise<{ markerId: string; jobId: string | null }> {
  const markerId = housecallMarkerId(input.externalJobId);
  const activeStorm = await getActiveStormEvent();
  const now = new Date().toISOString();
  const isActive = input.markerStatus !== "completed";

  const { data: existingOutage } = await db
    .from("outages")
    .select("first_seen_at")
    .eq("id", markerId)
    .maybeSingle();

  const outageRow: Record<string, unknown> = {
    id: markerId,
    external_job_id: input.externalJobId,
    source: "office",
    lat: input.lat ?? 0,
    lng: input.lng ?? 0,
    street_address: input.address,
    customer_name: input.customerName,
    customer_phone: input.customerPhone,
    lead_source: input.leadSource,
    assigned_tech_name: input.assignedTechName,
    office_notes: input.notes,
    external_job_status: input.externalStatus,
    status: input.markerStatus,
    is_active: isActive,
    customers: 1,
    outage_type: "Housecall Lead",
    cause: input.notes ?? "Housecall intake",
    first_seen_at: existingOutage?.first_seen_at ?? now,
    last_updated_at: now,
    ...(activeStorm ? { storm_event_id: activeStorm.id } : {}),
  };

  await db.from("outages").upsert(outageRow, { onConflict: "id" });

  if (!input.lat || !input.lng) {
    return { markerId, jobId: null };
  }

  const jobStatus = queueJobStatus(input.externalStatus, input.markerStatus);
  const jobNotes = input.notes
    ? `[hcp:${input.externalJobId}] ${input.notes}`
    : `[hcp:${input.externalJobId}]`;

  const jobPayload: Record<string, unknown> = {
    source: "office",
    outage_id: markerId,
    customer_name: input.customerName,
    customer_address: input.address,
    customer_phone: input.customerPhone,
    customer_lat: input.lat,
    customer_lng: input.lng,
    job_type: "storm_response",
    notes: jobNotes,
    status: jobStatus,
    is_confirmed_opportunity: input.markerStatus === "opportunity",
    updated_at: now,
  };

  const { data: existingJob } = await db
    .from("jobs")
    .select("id")
    .eq("outage_id", markerId)
    .maybeSingle();

  if (existingJob?.id) {
    await db.from("jobs").update(jobPayload).eq("id", existingJob.id);
    return { markerId, jobId: existingJob.id };
  }

  const { data: inserted } = await db
    .from("jobs")
    .insert({ ...jobPayload, priority_score: 0 })
    .select("id")
    .single();

  return { markerId, jobId: inserted?.id ?? null };
}
