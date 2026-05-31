/**
 * GET  /api/admin  — fetch priority weights + app settings
 * POST /api/admin  — update priority weights or settings
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";

export async function GET(req: Request) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { verifyJWT(token); } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json({
      weights: {
        customers_multiplier: 1.0, urgency_multiplier: 1.5,
        office_job_bonus: 50.0, density_bonus: 20.0,
        time_weight: 0.1, confirmed_opportunity_bonus: 100.0,
      },
      settings: {
        simulation_mode: false,
        active_sources: ["xcel"],
        connexus_enabled: false,
        fetch_interval_minutes: 15,
        storm_phase: "phase_1",
        temp_out_mode: false,
      },
      integrations: {
        housecall: {
          apiKeyConfigured: !!process.env.HOUSECALL_API_KEY,
          webhookSecretConfigured: !!process.env.HOUSECALL_WEBHOOK_SECRET,
          maxPlanRequired: true,
        },
      },
    });
  }

  try {
    const db = getAdmin();
    const [{ data: weights }, { data: settings }] = await Promise.all([
      db.from("priority_weights").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("app_settings").select("key, value"),
    ]);

    const settingsMap: Record<string, any> = {};
    for (const s of settings ?? []) settingsMap[s.key] = s.value;

    return NextResponse.json({
      weights,
      settings: settingsMap,
      integrations: {
        housecall: {
          apiKeyConfigured: !!process.env.HOUSECALL_API_KEY,
          webhookSecretConfigured: !!process.env.HOUSECALL_WEBHOOK_SECRET,
          maxPlanRequired: true,
        },
      },
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

    if (payload.role !== "admin" && payload.role !== "office") {
      return NextResponse.json({ error: "Admin/office role required" }, { status: 403 });
    }

    const body = await req.json();
    const { type, data } = body;

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });

    const db = getAdmin();

    if (type === "weights") {
      const { error } = await db.from("priority_weights").insert({ ...data, updated_by: payload.sub });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else if (type === "settings") {
      for (const [key, value] of Object.entries(data)) {
        await db.from("app_settings").upsert(
          { key, value, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      }
    } else {
      return NextResponse.json({ error: "type must be 'weights' or 'settings'" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
