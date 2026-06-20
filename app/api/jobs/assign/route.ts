/**
 * POST /api/jobs/assign
 *
 * Find the best available tech to a job/outage using weighted scoring.
 * Score favors close distance, in-territory assignment, and lighter workload.
 * Returns the recommended tech — office must confirm before dispatch.
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";
import { haversineMiles } from "@/lib/priority";
import { notifyDispatchAssigned } from "@/lib/notifications";
import { canDispatch } from "@/lib/dispatch-roles";
import { findTerritoriesForLocation } from "@/lib/territory-match";

export async function POST(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try { payload = verifyJWT(token); } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (!canDispatch(payload.role)) {
      return NextResponse.json({ error: "Office role required" }, { status: 403 });
    }

    const { jobId, outageId, targetLat, targetLng, confirm = false, recommendedTechId } = await req.json();

    const itemId = jobId ?? outageId;
    const itemType: "job" | "outage" = outageId ? "outage" : "job";

    if (!itemId || targetLat == null || targetLng == null) {
      return NextResponse.json({ error: "jobId or outageId + targetLat + targetLng required" }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ error: "Database required for tech assignment" }, { status: 503 });
    }

    const db = getAdmin();
    let targetAddress: string | null = null;

    // Find available techs with location
    const { data: techs } = await db
      .from("technicians")
      .select("*, users(id, name, email, phone)")
      .eq("status", "available")
      .not("current_lat", "is", null)
      .not("current_lng", "is", null);

    if (!techs || techs.length === 0) {
      return NextResponse.json({ error: "No available techs with known location" }, { status: 404 });
    }

    // Territory-first dispatch: try to find the closest tech whose territory contains the target
    // Territory is matched by zip code. Determine target zip from outage/job data.
    let targetZip: string | null = null;
    if (itemType === "outage") {
      const { data: outage } = await db.from("outages").select("zip_code,street_address").eq("id", itemId).maybeSingle();
      targetZip = outage?.zip_code ?? null;
      targetAddress = outage?.street_address ?? null;
    } else {
      const { data: job } = await db.from("jobs").select("customer_address").eq("id", itemId).maybeSingle();
      // crude zip extraction from address string e.g. "... CO 80201"
      const match = job?.customer_address?.match(/\b(\d{5})\b/);
      if (match) targetZip = match[1];
      targetAddress = job?.customer_address ?? null;
    }

    const { data: territories } = await db
      .from("territories")
      .select("id, zip_codes, geometry");

    const matchingTerritoryIds = findTerritoriesForLocation(
      { lat: targetLat, lng: targetLng, zipCode: targetZip },
      territories ?? []
    );

    let inTerritoryTechs: typeof techs = [];
    if (matchingTerritoryIds.length > 0) {
      inTerritoryTechs = techs.filter((t) => matchingTerritoryIds.includes(t.territory_id));
    }

    // Dispatch guardrails (configurable in app_settings; defaults are storm-safe).
    const settingsKeys = ["max_jobs_per_tech", "overtime_hours_soft_limit", "overtime_hours_hard_limit"];
    const { data: settingsRows } = await db
      .from("app_settings")
      .select("key,value")
      .in("key", settingsKeys);
    const settingsMap: Record<string, any> = {};
    for (const r of settingsRows ?? []) settingsMap[r.key] = r.value;
    const maxJobsPerTech = Math.max(1, Number(settingsMap.max_jobs_per_tech ?? 4));
    const overtimeSoftHours = Math.max(6, Number(settingsMap.overtime_hours_soft_limit ?? 10));
    const overtimeHardHours = Math.max(overtimeSoftHours + 1, Number(settingsMap.overtime_hours_hard_limit ?? 14));

    // Use in-territory techs if any, otherwise fall back to all available techs
    const candidateTechs = inTerritoryTechs.length > 0 ? inTerritoryTechs : techs;
    const usedTerritoryFilter = inTerritoryTechs.length > 0;

    // Build workload map (open assigned/in-progress work) to avoid overloading one tech
    const candidateTechIds = candidateTechs.map((t) => t.user_id).filter(Boolean);
    const workloadMap: Record<string, number> = {};
    if (candidateTechIds.length > 0) {
      const { data: openJobs } = await db
        .from("jobs")
        .select("assigned_tech_id,status")
        .in("assigned_tech_id", candidateTechIds)
        .in("status", ["assigned", "in_progress", "pending"]);
      for (const j of openJobs ?? []) {
        const k = String(j.assigned_tech_id);
        workloadMap[k] = (workloadMap[k] ?? 0) + 1;
      }
    }

    const scored = candidateTechs.map((t) => {
      const distance = haversineMiles(targetLat, targetLng, t.current_lat!, t.current_lng!);
      const isInTerritory = matchingTerritoryIds.length > 0 && matchingTerritoryIds.includes(t.territory_id);
      const activeLoad = workloadMap[String(t.user_id)] ?? 0;
      const returnTrips = Number(t.return_trip_count ?? 0);
      const completed = Number(t.completed_count ?? 0);
      const workingHours = t.working_since
        ? (Date.now() - new Date(t.working_since).getTime()) / 3_600_000
        : 0;
      const overSoft = Math.max(0, workingHours - overtimeSoftHours);
      const overHard = workingHours >= overtimeHardHours;

      // Lower is better, so we invert into a final positive "score"
      const penaltyDistance = distance * 12;
      const penaltyLoad = activeLoad * 25;
      const penaltyReturnTrips = Math.min(returnTrips, 6) * 3;
      const penaltyOvertime = overSoft * 10;
      const penaltyLoadCap = activeLoad >= maxJobsPerTech ? 80 : 0;
      const bonusTerritory = isInTerritory ? 18 : 0;
      const bonusProductivity = Math.min(completed, 40) * 0.2;
      const penaltyHardOvertime = overHard ? 200 : 0;
      const final = Math.round((100 - penaltyDistance - penaltyLoad - penaltyReturnTrips - penaltyOvertime - penaltyLoadCap - penaltyHardOvertime + bonusTerritory + bonusProductivity) * 10) / 10;

      const reasons: string[] = [];
      reasons.push(`Distance ${distance.toFixed(1)} mi`);
      reasons.push(`Open load ${activeLoad}`);
      if (workingHours > 0) reasons.push(`Shift ${workingHours.toFixed(1)}h`);
      if (isInTerritory) reasons.push("Inside target territory");
      if (!isInTerritory && matchingTerritoryIds.length > 0) reasons.push("Outside target territory");
      if (returnTrips > 0) reasons.push(`Return trips ${returnTrips}`);
      if (activeLoad >= maxJobsPerTech) reasons.push(`At load cap (${maxJobsPerTech})`);
      if (overSoft > 0) reasons.push(`Overtime +${overSoft.toFixed(1)}h`);
      if (overHard) reasons.push("Hard overtime threshold reached");

      return {
        tech: t,
        distance,
        activeLoad,
        isInTerritory,
        workingHours: Math.round(workingHours * 10) / 10,
        score: final,
        reasons,
      };
    }).sort((a, b) => b.score - a.score);

    let chosen = scored[0];
    if (confirm && recommendedTechId) {
      const pinned = scored.find((s) => s.tech.user_id === recommendedTechId);
      if (pinned) chosen = pinned;
    }
    const chosenTechName = (chosen.tech.users as { name?: string } | null)?.name ?? "Unknown";
    const recommended = {
      techId: chosen.tech.user_id,
      techName: chosenTechName,
      techEmail: (chosen.tech.users as any)?.email ?? null,
      distanceMiles: Math.round(chosen.distance * 10) / 10,
      currentLat: chosen.tech.current_lat,
      currentLng: chosen.tech.current_lng,
      inTerritory: chosen.isInTerritory || usedTerritoryFilter,
      recommendationScore: chosen.score,
      activeLoad: chosen.activeLoad,
      workingHours: chosen.workingHours,
      maxJobsPerTech,
      overtimeSoftHours,
      overtimeHardHours,
      reasons: chosen.reasons,
      alternatives: scored.slice(1, 3).map((s) => ({
        techId: s.tech.user_id,
        techName: (s.tech.users as any)?.name ?? "Unknown",
        distanceMiles: Math.round(s.distance * 10) / 10,
        recommendationScore: s.score,
        activeLoad: s.activeLoad,
        workingHours: s.workingHours,
        inTerritory: s.isInTerritory,
      })),
    };

    // If confirmed, persist the assignment
    if (confirm) {
      if (itemType === "job") {
        await db.from("jobs").update({
          assigned_tech_id: chosen.tech.user_id,
          status: "assigned",
          updated_at: new Date().toISOString(),
        }).eq("id", itemId);
      } else {
        const { data: newJob, error: jobErr } = await db.from("jobs").insert({
          source: "office",
          outage_id: itemId,
          customer_address: targetAddress ?? `Outage at ${targetLat.toFixed(4)}, ${targetLng.toFixed(4)}`,
          customer_lat: targetLat,
          customer_lng: targetLng,
          job_type: "repair",
          priority: 7,
          status: "assigned",
          assigned_tech_id: chosen.tech.user_id,
          priority_score: 0,
          created_by: payload.sub,
        }).select("id").single();

        if (jobErr) {
          return NextResponse.json({ error: jobErr.message }, { status: 500 });
        }

        await db.from("outages").update({
          assigned_tech_name: chosenTechName,
          last_updated_at: new Date().toISOString(),
        }).eq("id", itemId);

        await db.from("technicians").update({
          status: "working",
          current_job_id: newJob?.id ?? itemId,
          updated_at: new Date().toISOString(),
        }).eq("user_id", chosen.tech.user_id);

        const techPhone = (chosen.tech.users as any)?.phone ?? null;
        await notifyDispatchAssigned({
          techPhone,
          techName: (chosen.tech.users as any)?.name ?? null,
          address: targetAddress ?? `Near ${targetLat.toFixed(4)}, ${targetLng.toFixed(4)}`,
          kind: itemType,
        });

        return NextResponse.json({ recommended, confirmed: confirm });
      }

      if (itemType === "job") {
        await db.from("outages").update({
          assigned_tech_name: chosenTechName,
          last_updated_at: new Date().toISOString(),
        }).eq("id", `office-${itemId}`);
      }

      await db.from("technicians").update({
        status: "working",
        current_job_id: itemId,
        updated_at: new Date().toISOString(),
      }).eq("user_id", chosen.tech.user_id);

      const techPhone = (chosen.tech.users as any)?.phone ?? null;
      await notifyDispatchAssigned({
        techPhone,
        techName: (chosen.tech.users as any)?.name ?? null,
        address: targetAddress ?? `Near ${targetLat.toFixed(4)}, ${targetLng.toFixed(4)}`,
        kind: itemType,
      });
    }

    return NextResponse.json({ recommended, confirmed: confirm });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
