/**
 * GET  /api/simulation  — get simulation state + active scenario
 * POST /api/simulation  — toggle simulation mode on/off
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";

export async function GET() {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ simulationMode: false, scenario: null });
  }

  try {
    const db = getAdmin();
    const [{ data: setting }, { data: scenario }] = await Promise.all([
      db.from("app_settings").select("value").eq("key", "simulation_mode").maybeSingle(),
      db.from("test_scenarios").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    return NextResponse.json({
      simulationMode: setting?.value === true || setting?.value === "true",
      scenario,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try { payload = verifyJWT(token); } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (payload.role !== "admin" && payload.role !== "office" && payload.role !== "owner") {
      return NextResponse.json({ error: "Admin/office role required" }, { status: 403 });
    }

    const { enable, scenarioId } = await req.json();

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });

    const db = getAdmin();

    // Update global setting
    await db.from("app_settings").upsert(
      { key: "simulation_mode", value: enable ? true : false, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );

    // Activate/deactivate scenario
    if (enable) {
      await db.from("test_scenarios").update({ is_active: false });
      if (scenarioId) {
        await db.from("test_scenarios").update({ is_active: true }).eq("id", scenarioId);
      } else {
        // Activate first available
        const { data: first } = await db.from("test_scenarios").select("id").order("created_at").limit(1).maybeSingle();
        if (first?.id) await db.from("test_scenarios").update({ is_active: true }).eq("id", first.id);
      }
    } else {
      await db.from("test_scenarios").update({ is_active: false });
    }

    return NextResponse.json({ success: true, simulationMode: enable });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
