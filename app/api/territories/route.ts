/**
 * GET  /api/territories  — list all territories
 * POST /api/territories  — create a territory (admin/office only)
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";

export async function GET() {
  if (!isSupabaseConfigured) return NextResponse.json({ territories: [] });
  try {
    const db = getAdmin();
    const { data, error } = await db.from("territories").select("*").order("name");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ territories: data ?? [] });
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

    if (payload.role !== "office" && payload.role !== "admin") {
      return NextResponse.json({ error: "Office role required" }, { status: 403 });
    }

    const { name, type, geometry, zipCodes } = await req.json();
    if (!name || !type) return NextResponse.json({ error: "name and type required" }, { status: 400 });

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });

    const db = getAdmin();
    const { data, error } = await db
      .from("territories")
      .insert({ name, type, geometry: geometry ?? null, zip_codes: zipCodes ?? null })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, territory: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
