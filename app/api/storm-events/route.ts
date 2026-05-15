/**
 * GET  /api/storm-events   — list storm events (recent first)
 * POST /api/storm-events   — create (start) or end a storm event
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";

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
  const { data, error } = await db
    .from("storm_events")
    .select("*, created_by_user:users!created_by(name)")
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
    return NextResponse.json({ success: true, event: data });
  }

  if (body.action === "end" && body.id) {
    const { error } = await db
      .from("storm_events")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "action must be start or end" }, { status: 400 });
}
