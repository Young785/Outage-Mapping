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
        routing_mode: "simple",
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

    if (payload.role !== "admin" && payload.role !== "office" && payload.role !== "owner") {
      return NextResponse.json({ error: "Admin/office role required" }, { status: 403 });
    }

    const body = await req.json();
    const { type, data } = body;

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });

    const db = getAdmin();

    if (type === "weights") {
      const { error } = await db.from("priority_weights").insert({ ...data, updated_by: payload.sub });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else if (type === "routing") {
      if (payload.role !== "admin" && payload.role !== "owner") {
        return NextResponse.json({ error: "Admin or owner role required to change routing mode" }, { status: 403 });
      }
      const mode = data?.routing_mode;
      if (mode !== "complicated" && mode !== "simple") {
        return NextResponse.json({ error: "routing_mode must be 'complicated' or 'simple'" }, { status: 400 });
      }
      const { error } = await db.from("app_settings").upsert(
        { key: "routing_mode", value: mode, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else if (type === "settings") {
      for (const [key, value] of Object.entries(data)) {
        await db.from("app_settings").upsert(
          { key, value, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      }
    } else if (type === "list_users") {
      if (payload.role !== "admin" && payload.role !== "owner") {
        return NextResponse.json({ error: "Admin or owner role required to list users" }, { status: 403 });
      }
      const { data: users, error } = await db
        .from("users")
        .select("id, email, name, role, phone")
        .order("name", { ascending: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ users: users ?? [] });
    } else if (type === "set_user_role") {
      if (payload.role !== "admin" && payload.role !== "owner") {
        return NextResponse.json({ error: "Admin or owner role required to change roles" }, { status: 403 });
      }
      const userId = typeof data?.userId === "string" ? data.userId : "";
      const nextRole = typeof data?.role === "string" ? data.role : "";
      const allowed = payload.role === "owner"
        ? ["tech", "office", "admin", "owner"]
        : ["tech", "office", "admin"];
      if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
      if (!allowed.includes(nextRole)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }

      const { data: target, error: loadErr } = await db
        .from("users")
        .select("id, email, name, role")
        .eq("id", userId)
        .maybeSingle();
      if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
      if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
      if (payload.role !== "owner" && target.role === "owner") {
        return NextResponse.json({ error: "Only an owner can change another owner" }, { status: 403 });
      }
      if (target.role === "owner" && nextRole !== "owner") {
        const { count, error: countErr } = await db
          .from("users")
          .select("id", { count: "exact", head: true })
          .eq("role", "owner");
        if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
        if ((count ?? 0) <= 1) {
          return NextResponse.json({ error: "Cannot demote the last owner" }, { status: 400 });
        }
      }

      const { data: updated, error: updateErr } = await db
        .from("users")
        .update({ role: nextRole })
        .eq("id", userId)
        .select("id, email, name, role, phone")
        .single();
      if (updateErr || !updated) {
        return NextResponse.json({ error: updateErr?.message ?? "Role update failed" }, { status: 500 });
      }

      if (nextRole === "tech") {
        const { data: existingTech } = await db
          .from("technicians")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        if (!existingTech) {
          await db.from("technicians").insert({ user_id: userId, status: "available" });
        }
      }

      return NextResponse.json({ success: true, user: updated });
    } else {
      return NextResponse.json({ error: "type must be 'weights', 'settings', 'routing', 'list_users', or 'set_user_role'" }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
