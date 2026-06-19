/**
 * GET /api/storm-events/[id]/export?format=csv|geojson
 */

import { NextResponse } from "next/server";
import { extractBearerToken, verifyJWT } from "@/lib/jwt";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "id\n";
  const headers = Object.keys(rows[0]);
  return [headers.join(","), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(","))].join("\n");
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await params;
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try {
      payload = verifyJWT(token);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (!["office", "admin", "owner"].includes(payload.role)) {
      return NextResponse.json({ error: "Office role required" }, { status: 403 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ error: "Database not configured" }, { status: 503 });
    }

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") === "geojson" ? "geojson" : "csv";

    const db = getAdmin();
    const { data: event, error: eventErr } = await db
      .from("storm_events")
      .select("id, name, started_at, ended_at")
      .eq("id", eventId)
      .maybeSingle();

    if (eventErr || !event) {
      return NextResponse.json({ error: eventErr?.message ?? "Storm event not found" }, { status: 404 });
    }

    let outagesQuery = db
      .from("outages")
      .select(
        "id, source, lat, lng, street_address, city, state, zip_code, customers, status, priority_score, storm_event_id, first_seen_at, last_updated_at, no_contact_made"
      )
      .eq("storm_event_id", eventId);

    let { data: outages, error: outErr } = await outagesQuery;

    if (outErr && /storm_event_id|column/i.test(outErr.message)) {
      const fallback = await db
        .from("outages")
        .select("id, source, lat, lng, street_address, city, state, customers, status, priority_score, first_seen_at, last_updated_at")
        .gte("first_seen_at", event.started_at)
        .lte("first_seen_at", event.ended_at ?? new Date().toISOString());
      outages = fallback.data as typeof outages;
      outErr = fallback.error;
    }

    if (outErr) return NextResponse.json({ error: outErr.message }, { status: 500 });

    const rows = (outages ?? []) as Record<string, unknown>[];
    const safeName = (event.name || "storm").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();

    if (format === "geojson") {
      const geojson = {
        type: "FeatureCollection",
        metadata: { stormEvent: event, exportedAt: new Date().toISOString(), count: rows.length },
        features: rows
          .filter((o) => o.lat != null && o.lng != null)
          .map((o) => ({
            type: "Feature",
            geometry: { type: "Point", coordinates: [o.lng, o.lat] },
            properties: { ...o },
          })),
      };
      return new NextResponse(JSON.stringify(geojson, null, 2), {
        headers: {
          "Content-Type": "application/geo+json",
          "Content-Disposition": `attachment; filename="${safeName}-outages.geojson"`,
        },
      });
    }

    const csv = toCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}-outages.csv"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
