/**
 * GET /api/cron/fetch-outages
 *
 * Called by Vercel Cron every 5 minutes (vercel.json).
 * Pulls fresh outage data from all active sources and upserts into the DB.
 * The CRON_SECRET env var protects against unauthorized calls.
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { fetchAndNormalize } from "@/lib/adapters";
import { reverseGeocode } from "@/lib/geocache";
import { calculateScore, getWeights } from "@/lib/priority";
import { getActiveStormEvent } from "@/lib/storm-events";
import { mapPool } from "@/lib/map-pool";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  // Validate cron secret so only Vercel (or an authorized caller) can trigger this
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json({ ok: false, reason: "Supabase not configured" });
  }

  const db = getAdmin();

  // Check simulation mode — skip live fetch when simulation is active
  const { data: simRow } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "simulation_mode")
    .maybeSingle();
  if (simRow?.value === "true") {
    return NextResponse.json({ ok: true, skipped: true, reason: "simulation mode active" });
  }

  // Resolve active sources from DB settings
  const { data: srcRow } = await db
    .from("app_settings")
    .select("value")
    .eq("key", "active_sources")
    .maybeSingle();
  const sources: string[] = srcRow?.value ? JSON.parse(srcRow.value) : ["xcel"];

  if (sources.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no active sources" });
  }

  const started = Date.now();
  const { outages: features, results } = await fetchAndNormalize(sources as Array<"xcel" | "connexus">);
  const errors = results.filter((r) => r.error).map((r) => `[${r.source}] ${r.error}`);

  // Geocode with limited concurrency — unbounded Promise.all exhausted PostgREST pool
  const weights = await getWeights();
  const enriched = await mapPool(features, 4, async (f) => {
    let streetAddress: string | null = null;
    if (f.lat && f.lng) {
      const geo = await reverseGeocode(f.lat, f.lng);
      streetAddress = geo?.formattedAddress ?? null;
    }
    const score = calculateScore(
      { customers: f.customers, outageType: f.outageType, isOfficeJob: false },
      weights
    );
    return { ...f, streetAddress, priorityScore: score };
  });

  // Upsert into outages table
  if (enriched.length > 0) {
    const activeStorm = await getActiveStormEvent();
    const ids = enriched.map((o) => o.id);
    const { data: existingRows } = await db.from("outages").select("id").in("id", ids);
    const existingIds = new Set((existingRows ?? []).map((r) => r.id));

    const rows = enriched.map((o) => {
      const base: Record<string, unknown> = {
      id: o.id,
      source: o.source,
      lat: o.lat,
      lng: o.lng,
      city: o.city ?? null,
      county: o.county ?? null,
      state: o.state ?? null,
      street_address: o.streetAddress ?? null,
      customers: o.customers,
      outage_type: o.outageType ?? null,
      cause: o.cause ?? null,
      etr: o.etr ?? null,
      crew_status: o.crewStatus ?? null,
      outage_impact: o.outageImpact ?? null,
      priority_score: o.priorityScore ?? 0,
      is_simulation: false,
      updated_at: new Date().toISOString(),
      };
      if (activeStorm && !existingIds.has(o.id)) {
        base.storm_event_id = activeStorm.id;
      }
      return base;
    });

    const { error: upsertErr } = await db
      .from("outages")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: false });

    if (upsertErr) {
      console.error("[cron] Upsert error:", upsertErr.message);
    }
  }

  const elapsed = Date.now() - started;
  return NextResponse.json({
    ok: true,
    fetched: enriched.length,
    errors,
    elapsed_ms: elapsed,
    sources,
  });
}
