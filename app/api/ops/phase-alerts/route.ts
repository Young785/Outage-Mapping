import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";

function isOfficeRole(role: string) {
  return role === "office" || role === "admin" || role === "owner";
}

type Bucket = { city: string; total: number; lowYield: number; hot: number };

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
    return NextResponse.json({ hotZones: [], lowYieldZones: [], basis: "no_db" });
  }

  const db = getAdmin();
  const sinceIso = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("outages")
    .select("city,status,last_updated_at")
    .eq("is_active", true)
    .gte("last_updated_at", sinceIso)
    .limit(3000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const buckets = new Map<string, Bucket>();
  for (const row of data ?? []) {
    const city = (row.city || "Unknown").trim() || "Unknown";
    const b = buckets.get(city) ?? { city, total: 0, lowYield: 0, hot: 0 };
    b.total += 1;
    if (["no_opportunity", "utility_issue", "completed"].includes(row.status)) b.lowYield += 1;
    if (["wants_to_proceed", "sold", "job_started", "opportunity"].includes(row.status)) b.hot += 1;
    buckets.set(city, b);
  }

  const list = Array.from(buckets.values()).filter((b) => b.total >= 4);
  const hotZones = list
    .map((b) => ({ city: b.city, hotScore: Math.round((b.hot / b.total) * 100), hotCount: b.hot, sample: b.total }))
    .filter((b) => b.hotScore >= 45)
    .sort((a, b) => b.hotScore - a.hotScore)
    .slice(0, 5);

  const lowYieldZones = list
    .map((b) => ({ city: b.city, lowYieldScore: Math.round((b.lowYield / b.total) * 100), lowYieldCount: b.lowYield, sample: b.total }))
    .filter((b) => b.lowYieldScore >= 55)
    .sort((a, b) => b.lowYieldScore - a.lowYieldScore)
    .slice(0, 5);

  return NextResponse.json({
    basis: "last_72h_active_outages",
    hotZones,
    lowYieldZones,
  });
}

