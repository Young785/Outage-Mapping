/**
 * GET  /api/storm-events   — list storm events (recent first)
 * POST /api/storm-events   — create (start) or end a storm event
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";
import { setActiveStormEventId } from "@/lib/storm-events";

function requireOffice(req: Request) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return null;
  try {
    const p = verifyJWT(token);
    if (["office", "admin", "owner"].includes(p.role)) return p;
  } catch {}
  return null;
}

export async function GET(req: Request) {
  const payload = requireOffice(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured) return NextResponse.json({ events: [] });

  const db = getAdmin();
  let { data, error } = await db
    .from("storm_events")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(20);

  if (!error && data?.length) {
    const creatorIds = [...new Set(data.map((e) => e.created_by).filter(Boolean))] as string[];
    if (creatorIds.length > 0) {
      const { data: users } = await db.from("users").select("id, name").in("id", creatorIds);
      const nameById = new Map((users ?? []).map((u) => [u.id, u.name]));
      data = data.map((e) => ({
        ...e,
        created_by_user: e.created_by ? { name: nameById.get(e.created_by) ?? null } : null,
      }));
    }
  }

  if (error) {
    if (/storm_events|does not exist|schema cache/i.test(error.message)) {
      return NextResponse.json({
        events: [],
        warning: "storm_events table missing — run supabase/migrations/20260528120000_storm_events.sql",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ events: data ?? [] });
}

export async function POST(req: Request) {
  const payload = requireOffice(req);
  if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });

  const body = await req.json();
  const db = getAdmin();

  // action: "start" | "end"
  if (body.action === "start") {
    const { data, error } = await db
      .from("storm_events")
      .insert({ name: body.name || "Storm Event", notes: body.notes || null, created_by: payload.sub })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await setActiveStormEventId(data.id);
    return NextResponse.json({ success: true, event: data });
  }

  if (body.action === "end" && body.id) {
    const { error } = await db
      .from("storm_events")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await setActiveStormEventId(null);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "action must be start or end" }, { status: 400 });
}
