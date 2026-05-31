import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";

function isOfficeRole(role: string) {
  return role === "office" || role === "admin" || role === "owner";
}

export async function GET(req: Request) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: { role: string };
  try {
    payload = verifyJWT(token) as { role: string };
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  if (!isOfficeRole(payload.role)) {
    return NextResponse.json({ error: "Office role required" }, { status: 403 });
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json({
      metrics: {
        activeCallsInQueue: 0,
        soldJobs: 0,
        confirmedOpportunities: 0,
        tempOutPendingReturn: 0,
      },
    });
  }

  const db = getAdmin();
  const [jobsRes, soldRes, oppRes, tempRes, outagesTotal, jobsTotal, invTotal, recentOutages, recentJobs] = await Promise.all([
    db.from("jobs").select("id", { count: "exact", head: true }).not("status", "in", '("completed","cancelled")'),
    db.from("outages").select("id", { count: "exact", head: true }).in("status", ["sold", "job_started", "completed"]),
    db.from("outages").select("id", { count: "exact", head: true }).in("status", ["opportunity", "door_hanger", "customer_thinking", "wants_to_proceed"]),
    db.from("outages").select("id", { count: "exact", head: true }).in("status", ["temp_power", "grounding"]),
    db.from("outages").select("id", { count: "exact", head: true }),
    db.from("jobs").select("id", { count: "exact", head: true }),
    db.from("investigations").select("id", { count: "exact", head: true }),
    db.from("outages").select("id", { count: "exact", head: true }).gte("first_seen_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    db.from("jobs").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  return NextResponse.json({
    metrics: {
      activeCallsInQueue: jobsRes.count ?? 0,
      soldJobs: soldRes.count ?? 0,
      confirmedOpportunities: oppRes.count ?? 0,
      tempOutPendingReturn: tempRes.count ?? 0,
    },
    storage: {
      provider: "Supabase Postgres",
      tables: ["outages", "jobs", "investigations", "technicians", "outage_snapshots", "geocode_cache", "storm_events"],
    },
    totals: {
      outages: outagesTotal.count ?? 0,
      jobs: jobsTotal.count ?? 0,
      investigations: invTotal.count ?? 0,
    },
    recent7d: {
      outages: recentOutages.count ?? 0,
      jobs: recentJobs.count ?? 0,
    },
  });
}

