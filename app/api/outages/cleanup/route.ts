import { NextResponse } from "next/server";
import { extractBearerToken, verifyJWT } from "@/lib/jwt";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";

function isOfficeRole(role: string) {
  return role === "office" || role === "admin" || role === "owner";
}

export async function POST(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let payload: any;
    try {
      payload = verifyJWT(token);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    if (!isOfficeRole(payload.role)) {
      return NextResponse.json({ error: "Office role required" }, { status: 403 });
    }

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, affected: 0, stored: false });
    const db = getAdmin();
    const body = await req.json();
    const action = String(body.action ?? "");

    if (action === "deactivate_one") {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { error } = await db
        .from("outages")
        .update({ is_active: false, last_updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, affected: 1 });
    }

    if (action === "sweep_statuses") {
      const statuses = Array.isArray(body.statuses) ? body.statuses : ["completed", "no_opportunity"];
      const { data, error } = await db
        .from("outages")
        .update({ is_active: false, last_updated_at: new Date().toISOString() })
        .eq("is_active", true)
        .in("status", statuses)
        .select("id");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, affected: data?.length ?? 0 });
    }

    if (action === "sweep_all_active") {
      const now = new Date().toISOString();
      const { data, error } = await db
        .from("outages")
        .update({ is_active: false, last_updated_at: now })
        .eq("is_active", true)
        .select("id");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      let affected = data?.length ?? 0;

      // Office jobs without outage mirror rows would otherwise reappear via synthesis on the next fetch.
      const { data: officeJobs } = await db
        .from("jobs")
        .select("id, customer_name, customer_address, customer_lat, customer_lng, status, notes, priority_score, created_at")
        .eq("source", "office")
        .not("status", "in", "(\"completed\",\"cancelled\")");

      const jobRows = (officeJobs ?? [])
        .filter((j) => j.customer_lat != null && j.customer_lng != null)
        .map((j) => ({
          id: `office-${j.id}`,
          source: "office",
          lat: j.customer_lat,
          lng: j.customer_lng,
          street_address: j.customer_address ?? null,
          city: j.customer_address?.split(",")[1]?.trim() ?? null,
          county: "Unknown",
          customers: 1,
          outage_type: "Office Call-in Lead",
          cause: j.notes ?? "Office-entered lead",
          status: "unvisited",
          priority_score: j.priority_score ?? 0,
          first_seen_at: j.created_at ?? now,
          last_updated_at: now,
          is_active: false,
          lead_source: "office",
        }));

      if (jobRows.length > 0) {
        const { data: suppressed, error: jobErr } = await db
          .from("outages")
          .upsert(jobRows, { onConflict: "id" })
          .select("id");
        if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 });
        affected += suppressed?.length ?? 0;
      }

      return NextResponse.json({ success: true, affected });
    }

    if (action === "archive_stale") {
      const hours = Math.max(1, Number(body.hours ?? 48));
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const { data, error } = await db
        .from("outages")
        .update({ is_active: false, last_updated_at: new Date().toISOString() })
        .eq("is_active", true)
        .lt("first_seen_at", cutoff)
        .select("id");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, affected: data?.length ?? 0, cutoff });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

