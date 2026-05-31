import { NextResponse } from "next/server";
import { extractBearerToken, verifyJWT } from "@/lib/jwt";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";

function isOfficeRole(role: string) {
  return role === "office" || role === "admin" || role === "owner";
}

export async function POST(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let payload: any;
    try {
      payload = verifyJWT(token);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    if (!isOfficeRole(payload.role)) {
      return NextResponse.json({ error: "Office role required" }, { status: 403 });
    }

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, affected: 0, stored: false });
    const db = getAdmin();
    const body = await req.json();
    const action = String(body.action ?? "");

    if (action === "deactivate_one") {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const { error } = await db
        .from("outages")
        .update({ is_active: false, last_updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, affected: 1 });
    }

    if (action === "sweep_statuses") {
      const statuses = Array.isArray(body.statuses) ? body.statuses : ["completed", "no_opportunity"];
      const { data, error } = await db
        .from("outages")
        .update({ is_active: false, last_updated_at: new Date().toISOString() })
        .eq("is_active", true)
        .in("status", statuses)
        .select("id");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, affected: data?.length ?? 0 });
    }

    if (action === "archive_stale") {
      const hours = Math.max(1, Number(body.hours ?? 48));
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const { data, error } = await db
        .from("outages")
        .update({ is_active: false, last_updated_at: new Date().toISOString() })
        .eq("is_active", true)
        .lt("first_seen_at", cutoff)
        .select("id");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true, affected: data?.length ?? 0, cutoff });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

