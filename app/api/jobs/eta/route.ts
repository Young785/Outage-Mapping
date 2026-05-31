/**
 * POST /api/jobs/eta
 * Tech heartbeat endpoint:
 * - computes ETA for assigned/open jobs from current tech location
 * - auto-marks arrival when within threshold distance
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { extractBearerToken, verifyJWT } from "@/lib/jwt";
import { haversineMiles } from "@/lib/priority";
import { notifyAutoArrival } from "@/lib/notifications";

export async function POST(req: Request) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: { sub: string; role: string };
  try {
    payload = verifyJWT(token) as { sub: string; role: string };
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
  if (payload.role !== "tech" && payload.role !== "office" && payload.role !== "admin" && payload.role !== "owner") {
    return NextResponse.json({ error: "Role not allowed" }, { status: 403 });
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json({ eta: [], autoArrivals: [], stored: false });
  }

  const { lat, lng, arrivalThresholdMiles = 0.12 } = await req.json().catch(() => ({}));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng required" }, { status: 400 });
  }

  const db = getAdmin();
  const threshold = Math.max(0.05, Math.min(Number(arrivalThresholdMiles), 0.5));
  let officePhone: string | null = null;
  let techName: string | null = null;
  const { data: officeUsers } = await db
    .from("users")
    .select("phone,role")
    .in("role", ["office", "admin", "owner"])
    .not("phone", "is", null)
    .limit(1);
  officePhone = officeUsers?.[0]?.phone ?? null;
  const { data: me } = await db
    .from("users")
    .select("name")
    .eq("id", payload.sub)
    .maybeSingle();
  techName = me?.name ?? null;

  // Open jobs for this tech
  const { data: jobs, error } = await db
    .from("jobs")
    .select("id,outage_id,customer_name,customer_address,customer_lat,customer_lng,status,notes")
    .eq("assigned_tech_id", payload.sub)
    .in("status", ["assigned", "in_progress", "pending"]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const eta = (jobs ?? [])
    .filter((j) => j.customer_lat != null && j.customer_lng != null)
    .map((j) => {
      const miles = haversineMiles(lat, lng, j.customer_lat, j.customer_lng);
      const estimatedMinutes = Math.round((miles * 1.3) / 35 * 60);
      return {
        id: j.id,
        customerName: j.customer_name ?? null,
        address: j.customer_address ?? null,
        status: j.status,
        distanceMiles: Math.round(miles * 10) / 10,
        estimatedMinutes,
      };
    })
    .sort((a, b) => a.estimatedMinutes - b.estimatedMinutes);

  const autoArrivals: Array<{ jobId: string; distanceMiles: number }> = [];
  for (const row of eta) {
    if (row.distanceMiles > threshold) continue;
    const src = jobs?.find((j) => j.id === row.id);
    if (!src) continue;
    if (src.status !== "assigned" && src.status !== "pending") continue;

    const stamp = new Date().toISOString();
    const marker = `[auto_arrival] ${stamp} within ${row.distanceMiles}mi`;
    const mergedNotes = src.notes ? `${src.notes}\n${marker}` : marker;

    await db
      .from("jobs")
      .update({ status: "in_progress", notes: mergedNotes, updated_at: stamp })
      .eq("id", src.id);

    if (src.outage_id) {
      await db
        .from("outages")
        .update({ status: "job_started", last_updated_at: stamp })
        .eq("id", src.outage_id);
    }
    await notifyAutoArrival({
      officePhone,
      techName,
      address: src.customer_address ?? null,
    });
    autoArrivals.push({ jobId: src.id, distanceMiles: row.distanceMiles });
  }

  return NextResponse.json({ eta, autoArrivals, thresholdMiles: threshold });
}

