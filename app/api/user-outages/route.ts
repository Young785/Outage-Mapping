import { NextResponse } from "next/server";
import crypto from "crypto";
import { getAdmin } from "@/lib/supabase";

// GET - Retrieve all self-generated outages from Supabase
export async function GET() {
  try {
    const db = getAdmin();
    const { data, error } = await db
      .from("outages")
      .select("id, lat, lng, city, county, street_address, cause, customers, status, first_seen_at")
      .in("source", ["self_generated", "user", "user_reported"])
      .eq("is_active", true);

    if (error) throw error;

    const features = (data ?? []).map((outage: any) => ({
      attributes: {
        id: outage.id,
        city: outage.city,
        county: outage.county || "Unknown",
        customers: outage.customers ?? 1,
        outageType: "Self-generated Opportunity",
        cause: outage.cause || "Field-reported opportunity",
        etr: null,
        streetAddress: outage.street_address,
        isUserReported: true,
      },
      geometry: { y: outage.lat, x: outage.lng },
    }));

    return NextResponse.json({ count: features.length, features, source: "User Reports" });
  } catch (error: any) {
    console.error("Get user outages error:", error);
    return NextResponse.json({ error: "Failed to fetch user outages" }, { status: 500 });
  }
}

// POST - Create a new self-generated opportunity in Supabase
export async function POST(request: Request) {
  try {
    const db = getAdmin();
    const body = await request.json();
    const { lat, lng, streetAddress, city, county, description, customers, source, userId, userName } = body;

    if (!lat || !lng || !userId || !userName) {
      return NextResponse.json({ error: "Location (lat/lng) and user info are required" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const fullRow: Record<string, any> = {
      id,
      source: source || "self_generated",
      lat,
      lng,
      city: city || null,
      county: county || "Unknown",
      customers: Math.max(1, Number(customers || 1)),
      outage_type: "Self-generated Opportunity",
      cause: description || "Field-reported opportunity",
      status: "unvisited",
      street_address: streetAddress || null,
      lead_source: "self_generated",
      first_seen_at: now,
      last_updated_at: now,
      is_active: true,
    };

    const droppableColumns = new Set(["lead_source", "first_seen_at", "last_updated_at", "is_active", "street_address", "outage_type"]);
    const sourceCandidates = [source || "self_generated", "user", "manual"];
    const dropped = new Set<string>();

    function buildRow(src: string): Record<string, any> {
      const row: Record<string, any> = { ...fullRow, source: src };
      for (const col of dropped) delete row[col];
      return row;
    }

    let lastError: any = null;
    let succeeded = false;

    for (const src of sourceCandidates) {
      for (let attempt = 0; attempt < droppableColumns.size + 1; attempt++) {
        const { error } = await db.from("outages").upsert(buildRow(src));
        if (!error) { succeeded = true; break; }
        lastError = error;
        const colMatch = String(error.message || "").match(/Could not find the '([^']+)' column/);
        if (colMatch && droppableColumns.has(colMatch[1]) && !dropped.has(colMatch[1])) {
          dropped.add(colMatch[1]);
          continue;
        }
        break;
      }
      if (succeeded) break;
    }

    if (!succeeded) {
      console.error("[user-outages] Insert failed:", lastError);
      return NextResponse.json({ error: lastError?.message || "Failed to create opportunity" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      outage: {
        id, lat, lng, streetAddress,
        customers: Math.max(1, Number(customers || 1)),
        source: "self_generated",
        leadSource: "self_generated",
        status: "unvisited",
      },
    });
  } catch (error: any) {
    console.error("Create outage error:", error);
    return NextResponse.json({ error: "Failed to create outage report" }, { status: 500 });
  }
}
