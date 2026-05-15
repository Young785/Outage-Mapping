import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";

const DATA_DIR = path.join(process.cwd(), "data");
const USER_OUTAGES_FILE = path.join(DATA_DIR, "user-outages.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize outages file if it doesn't exist
if (!fs.existsSync(USER_OUTAGES_FILE)) {
  fs.writeFileSync(USER_OUTAGES_FILE, JSON.stringify([], null, 2));
}

function getUserOutages(): any[] {
  try {
    const data = fs.readFileSync(USER_OUTAGES_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function saveUserOutages(outages: any[]) {
  fs.writeFileSync(USER_OUTAGES_FILE, JSON.stringify(outages, null, 2));
}

// GET - Retrieve all user-reported outages
export async function GET() {
  try {
    const outages = getUserOutages();
    
    // Transform to feature format consistent with main outages API
    const features = outages.map((outage) => ({
      attributes: {
        id: outage.id,
        city: outage.city,
        county: outage.county || "Unknown",
        customers: 1,
        outageType: "User Reported Outage",
        cause: outage.description || "User reported",
        etr: null,
        reportedAt: outage.reportedAt,
        reportedBy: outage.userName,
        reportedByUserId: outage.userId,
        streetAddress: outage.streetAddress,
        isUserReported: true,
      },
      geometry: {
        y: outage.lat,
        x: outage.lng,
      },
    }));

    return NextResponse.json({
      count: features.length,
      features,
      source: "User Reports",
    });
  } catch (error: any) {
    console.error("Get user outages error:", error);
    return NextResponse.json(
      { error: "Failed to fetch user outages" },
      { status: 500 }
    );
  }
}

// POST - Create a new user-reported outage
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      lat,
      lng,
      streetAddress,
      city,
      county,
      description,
      customers,
      source,
      userId,
      userName,
      userEmail,
    } = body;

    // Validate required fields
    if (!lat || !lng || !userId || !userName) {
      return NextResponse.json(
        { error: "Location (lat/lng) and user info are required" },
        { status: 400 }
      );
    }

    if (isSupabaseConfigured) {
      const db = getAdmin();
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      // Build the full payload first. We progressively strip optional columns
      // if the DB rejects them (older schemas missing migrations 003/006/007).
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
      // Columns we are willing to drop if the DB schema is older.
      const droppableColumns = new Set([
        "lead_source",
        "first_seen_at",
        "last_updated_at",
        "is_active",
        "street_address",
        "outage_type",
      ]);
      // Source values to try in order if the source CHECK constraint rejects.
      const sourceCandidates = [
        source || "self_generated",
        "user",
        "manual",
        "xcel",
      ];

      const dropped = new Set<string>();
      function buildRow(src: string): Record<string, any> {
        const row: Record<string, any> = { ...fullRow, source: src };
        for (const col of dropped) delete row[col];
        return row;
      }

      let lastError: any = null;
      let succeeded = false;

      // Try each source variant. For each, retry-and-strip on column-missing errors.
      for (const src of sourceCandidates) {
        // Attempt up to N times per source (one strip per missing column).
        for (let attempt = 0; attempt < droppableColumns.size + 1; attempt++) {
          const { error } = await db.from("outages").upsert(buildRow(src));
          if (!error) {
            succeeded = true;
            break;
          }
          lastError = error;
          const msg = String(error.message || "");
          const colMatch = msg.match(/Could not find the '([^']+)' column/);
          if (colMatch && droppableColumns.has(colMatch[1]) && !dropped.has(colMatch[1])) {
            dropped.add(colMatch[1]);
            continue; // retry same source with stripped column
          }
          // Not a recoverable column error → break to next source candidate.
          break;
        }
        if (succeeded) break;
      }

      if (!succeeded) {
        return NextResponse.json(
          { error: lastError?.message || "Failed to create opportunity" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        outage: {
          id,
          lat,
          lng,
          streetAddress,
          customers: Math.max(1, Number(customers || 1)),
          source: "self_generated",
          leadSource: "self_generated",
          status: "unvisited",
        },
      });
    }

    const outages = getUserOutages();

    // Check for duplicate reports from same user at same location (within 100 meters) in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const duplicate = outages.find((o) => {
      if (o.userId !== userId || o.reportedAt < oneHourAgo) return false;
      const distance = Math.sqrt(
        Math.pow(o.lat - lat, 2) + Math.pow(o.lng - lng, 2)
      );
      return distance < 0.001; // roughly 100 meters
    });

    if (duplicate) {
      return NextResponse.json(
        { error: "You have already reported an outage at this location recently" },
        { status: 409 }
      );
    }

    // Create new outage report
    const newOutage = {
      id: crypto.randomUUID(),
      lat,
      lng,
      streetAddress: streetAddress || null,
      city: city || null,
      county: county || null,
      description: description || null,
      userId,
      userName,
      userEmail: userEmail || null,
      reportedAt: new Date().toISOString(),
      status: "reported",
    };

    outages.push(newOutage);
    saveUserOutages(outages);

    return NextResponse.json({
      success: true,
      outage: newOutage,
    });
  } catch (error: any) {
    console.error("Create outage error:", error);
    return NextResponse.json(
      { error: "Failed to create outage report" },
      { status: 500 }
    );
  }
}
