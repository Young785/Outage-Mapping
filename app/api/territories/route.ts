/**
 * GET  /api/territories  — list all territories
 * POST /api/territories  — create a territory (admin/office only)
 * PATCH /api/territories — update territory name/geometry/zip list
 * DELETE /api/territories?id=... — delete territory
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

    if (!["office", "admin", "owner"].includes(payload.role)) {
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

export async function PATCH(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try { payload = verifyJWT(token); } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (!["office", "admin", "owner"].includes(payload.role)) {
      return NextResponse.json({ error: "Office role required" }, { status: 403 });
    }

    const { id, name, type, geometry, zipCodes } = await req.json();
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });

    const update: Record<string, unknown> = {};
    if (name !== undefined) update.name = name;
    if (type !== undefined) update.type = type;
    if (geometry !== undefined) update.geometry = geometry;
    if (zipCodes !== undefined) update.zip_codes = zipCodes;

    const db = getAdmin();
    const { data, error } = await db
      .from("territories")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, territory: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try { payload = verifyJWT(token); } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (!["office", "admin", "owner"].includes(payload.role)) {
      return NextResponse.json({ error: "Office role required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });

    const db = getAdmin();
    const { error } = await db.from("territories").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
