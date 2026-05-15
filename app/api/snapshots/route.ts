/**
 * GET /api/snapshots  — list recent raw outage snapshots
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";

export async function GET(req: Request) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload;
  try { payload = verifyJWT(token); } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  if (payload.role !== "admin" && payload.role !== "office") {
    return NextResponse.json({ error: "Admin/office role required" }, { status: 403 });
  }

  if (!isSupabaseConfigured) return NextResponse.json({ snapshots: [] });

  try {
    const db = getAdmin();
    const { searchParams } = new URL(req.url);
    const source = searchParams.get("source");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);

    let query = db
      .from("outage_snapshots")
      .select("id, source, normalized_count, error, fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(limit);

    if (source) query = query.eq("source", source);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ snapshots: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
