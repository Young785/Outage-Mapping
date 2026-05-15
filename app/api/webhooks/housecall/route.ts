import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import {
  fetchHousecallJob,
  getHousecallEventId,
  getHousecallJobId,
  getHousecallSignatureHeader,
  isStormRelevantTag,
  leadSourceFromTags,
  postHousecallJobNote,
  verifyHousecallSignature,
} from "@/lib/housecall";

function normalizeJob(jobOrPayload: any): any {
  return jobOrPayload?.job ?? jobOrPayload?.data ?? jobOrPayload;
}

function statusToMarker(jobStatus: string | null, leadSource: string | null): string {
  const s = (jobStatus ?? "").toLowerCase();
  if (["completed", "closed"].includes(s)) return "completed";
  if (["scheduled", "accepted", "booked"].includes(s)) return "sold";
  if (leadSource === "self_generated") return "opportunity";
  return "unvisited";
}

export async function POST(req: Request) {
  const secret = process.env.HOUSECALL_WEBHOOK_SECRET || "";
  const rawBody = await req.text();
  const signature = getHousecallSignatureHeader(req.headers);

  if (!verifyHousecallSignature(rawBody, signature, secret)) {
    if (isSupabaseConfigured) {
      const db = getAdmin();
      await db.from("housecall_webhook_events").insert({
        event_id: `invalid-${Date.now()}`,
        status: "invalid_signature",
        payload_hash: "",
      });
    }
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: any = {};
  try { payload = JSON.parse(rawBody); } catch {}

  const eventId = getHousecallEventId(payload) || `evt-${Date.now()}`;
  const db = isSupabaseConfigured ? getAdmin() : null;

  if (db) {
    const { error: evErr } = await db.from("housecall_webhook_events").insert({
      event_id: eventId,
      status: "received",
      payload_hash: "",
    });
    if (evErr) return NextResponse.json({ duplicate: true, eventId });
  }

  try {
    const jobId = getHousecallJobId(payload);
    if (!jobId) throw new Error("jobId missing in webhook payload");

    const full = await fetchHousecallJob(jobId);
    const job = normalizeJob(full);
    const tags: string[] = (job?.tags ?? []).map((t: any) => (typeof t === "string" ? t : t?.name)).filter(Boolean);

    if (!isStormRelevantTag(tags)) {
      if (db) {
        await db.from("outages").update({ is_active: false, last_updated_at: new Date().toISOString() }).eq("external_job_id", jobId);
        await db.from("housecall_webhook_events").update({ status: "ignored_non_storm", processed_at: new Date().toISOString() }).eq("event_id", eventId);
      }
      return NextResponse.json({ ignored: true });
    }

    const leadSource = leadSourceFromTags(tags);
    const externalStatus = String(job?.status ?? job?.job_status ?? "");
    const markerStatus = statusToMarker(externalStatus, leadSource);
    const customerName = job?.customer?.name ?? job?.customer_name ?? job?.name ?? null;
    const customerPhone = job?.customer?.phone ?? job?.customer_phone ?? null;
    const address = job?.address?.full ?? job?.address ?? job?.customer_address ?? null;
    const lat = job?.address?.lat ?? job?.lat ?? null;
    const lng = job?.address?.lng ?? job?.lng ?? null;
    const assignedTechName = job?.assigned_tech?.name ?? job?.employee?.name ?? null;
    const notes = job?.notes ?? job?.description ?? null;
    const markerId = `hcp-${jobId}`;

    if (db) {
      const { data: existing } = await db
        .from("outages")
        .select("status")
        .eq("id", markerId)
        .maybeSingle();
      const priorStatus = existing?.status ?? null;

      await db.from("outages").upsert({
        id: markerId,
        external_job_id: jobId,
        source: "office",
        lat: lat ?? 0,
        lng: lng ?? 0,
        street_address: address,
        customer_name: customerName,
        customer_phone: customerPhone,
        lead_source: leadSource,
        assigned_tech_name: assignedTechName,
        office_notes: notes,
        external_job_status: externalStatus,
        status: markerStatus,
        is_active: true,
        first_seen_at: new Date().toISOString(),
        last_updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

      const converted = ["scheduled", "accepted", "booked"].includes(externalStatus.toLowerCase());
      const conversionType = leadSource === "self_generated" ? "self_generated" : null;
      if (converted && conversionType && priorStatus !== "sold") {
        await db.from("housecall_conversions").upsert({
          external_job_id: jobId,
          conversion_type: conversionType,
          from_status: priorStatus,
          to_status: externalStatus,
          converted_at: new Date().toISOString(),
        }, { onConflict: "external_job_id" });
        try { await postHousecallJobNote(jobId, "Converted — logged by storm app"); } catch {}
      }

      await db.from("housecall_webhook_events").update({
        status: "processed",
        processed_at: new Date().toISOString(),
      }).eq("event_id", eventId);
    }

    return NextResponse.json({ success: true, eventId, markerId });
  } catch (err: any) {
    if (db) {
      await db.from("housecall_webhook_events").update({
        status: `error:${err.message?.slice(0, 120) ?? "unknown"}`,
        processed_at: new Date().toISOString(),
      }).eq("event_id", eventId);
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
