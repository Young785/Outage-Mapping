/**
 * POST /api/jobs/queue/reorder — office manual queue ordering
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";

export async function POST(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try {
      payload = verifyJWT(token);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (payload.role !== "office" && payload.role !== "admin" && payload.role !== "owner") {
      return NextResponse.json({ error: "Office role required" }, { status: 403 });
    }

    const { orderedJobIds } = await req.json();
    if (!Array.isArray(orderedJobIds) || orderedJobIds.length === 0) {
      return NextResponse.json({ error: "orderedJobIds array required" }, { status: 400 });
    }

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });

    const db = getAdmin();
    const now = new Date().toISOString();

    for (let i = 0; i < orderedJobIds.length; i++) {
      const id = String(orderedJobIds[i]);
      const { error } = await db
        .from("jobs")
        .update({ sort_order: (i + 1) * 10, updated_at: now })
        .eq("id", id);
      if (error && !/sort_order|column/i.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Reorder failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
