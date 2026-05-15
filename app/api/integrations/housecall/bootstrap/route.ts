import { NextResponse } from "next/server";
import { extractBearerToken, verifyJWT } from "@/lib/jwt";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { HOUSECALL_ALLOWED_TAGS, leadSourceFromTags, listHousecallJobsByTag } from "@/lib/housecall";

export async function POST(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let payload: any;
    try { payload = verifyJWT(token); } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }
    if (!["admin", "owner", "office"].includes(payload.role)) {
      return NextResponse.json({ error: "Office/admin/owner required" }, { status: 403 });
    }
    if (!isSupabaseConfigured) return NextResponse.json({ success: true, imported: 0, stored: false });
    const db = getAdmin();

    let imported = 0;
    for (const tag of HOUSECALL_ALLOWED_TAGS) {
      const jobs = await listHousecallJobsByTag(tag);
      for (const j of jobs) {
        const job = j?.job ?? j;
        const tags: string[] = (job?.tags ?? []).map((t: any) => (typeof t === "string" ? t : t?.name)).filter(Boolean);
        const leadSource = leadSourceFromTags(tags);
        const externalStatus = String(job?.status ?? job?.job_status ?? "");
        const markerId = `hcp-${job.id}`;
        await db.from("outages").upsert({
          id: markerId,
          external_job_id: String(job.id),
          source: "office",
          lat: job?.address?.lat ?? job?.lat ?? 0,
          lng: job?.address?.lng ?? job?.lng ?? 0,
          street_address: job?.address?.full ?? job?.address ?? null,
          customer_name: job?.customer?.name ?? job?.customer_name ?? job?.name ?? null,
          customer_phone: job?.customer?.phone ?? job?.customer_phone ?? null,
          lead_source: leadSource,
          assigned_tech_name: job?.assigned_tech?.name ?? null,
          office_notes: job?.notes ?? null,
          external_job_status: externalStatus,
          status: ["completed", "closed"].includes(externalStatus.toLowerCase()) ? "completed" : "unvisited",
          is_active: true,
          first_seen_at: new Date().toISOString(),
          last_updated_at: new Date().toISOString(),
        }, { onConflict: "id" });
        imported++;
      }
    }
    return NextResponse.json({ success: true, imported });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
