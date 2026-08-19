/**
 * GET    /api/excluded-properties — list active (or all) permanent exclusions
 * POST   /api/excluded-properties — add exclusion (office)
 * PATCH  /api/excluded-properties — update / soft-deactivate
 * DELETE /api/excluded-properties?id=... — hard delete
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken, jwtErrorMessage } from "@/lib/jwt";
import { normalizeAddressKey } from "@/lib/address-match";

function requireOffice(req: Request) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  try {
    const payload = verifyJWT(token);
    if (!["office", "admin", "owner"].includes(payload.role)) {
      return { error: NextResponse.json({ error: "Office role required" }, { status: 403 }) };
    }
    return { payload };
  } catch (err) {
    return { error: NextResponse.json({ error: jwtErrorMessage(err) }, { status: 401 }) };
  }
}

export async function GET(req: Request) {
  if (!isSupabaseConfigured) return NextResponse.json({ excludedProperties: [] });
  try {
    const { searchParams } = new URL(req.url);
    const includeInactive = searchParams.get("all") === "1";
    const db = getAdmin();
    let q = db.from("excluded_properties").select("*").order("created_at", { ascending: false });
    if (!includeInactive) q = q.eq("is_active", true);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ excludedProperties: data ?? [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = requireOffice(req);
    if (auth.error) return auth.error;

    const body = await req.json();
    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
    }

    const address = typeof body.address === "string" ? body.address.trim() : null;
    const address_key = address ? normalizeAddressKey(address) : null;
    const radius_meters =
      body.radiusMeters != null && Number.isFinite(Number(body.radiusMeters))
        ? Number(body.radiusMeters)
        : 30;

    if (!isSupabaseConfigured) {
      return NextResponse.json({
        success: true,
        stored: false,
        excludedProperty: {
          id: "local",
          address,
          address_key,
          lat,
          lng,
          radius_meters,
          reason: body.reason || "manual",
          source: body.source || "manual",
          is_active: true,
        },
      });
    }

    const db = getAdmin();
    let query = db.from("excluded_properties").insert({
      address,
      address_key: address_key || null,
      lat,
      lng,
      radius_meters,
      county_pin: body.countyPin || null,
      use_class: body.useClass || null,
      reason: body.reason || "manual",
      source: body.source || "manual",
      notes: body.notes || null,
      created_by: auth.payload?.email || auth.payload?.sub || null,
      is_active: true,
      duration: body.duration === "temporary" ? "temporary" : "permanent",
      updated_at: new Date().toISOString(),
    });
    let { data, error } = await query.select("*").single();
    if (error && /duration|schema cache|does not exist/i.test(error.message)) {
      const retry = await db
        .from("excluded_properties")
        .insert({
          address,
          address_key: address_key || null,
          lat,
          lng,
          radius_meters,
          county_pin: body.countyPin || null,
          use_class: body.useClass || null,
          reason: body.reason || "manual",
          source: body.source || "manual",
          notes: body.notes || null,
          created_by: auth.payload?.email || auth.payload?.sub || null,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, excludedProperty: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = requireOffice(req);
    if (auth.error) return auth.error;

    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.address !== undefined) {
      update.address = body.address;
      update.address_key = body.address ? normalizeAddressKey(String(body.address)) : null;
    }
    if (body.lat !== undefined) update.lat = Number(body.lat);
    if (body.lng !== undefined) update.lng = Number(body.lng);
    if (body.radiusMeters !== undefined) update.radius_meters = Number(body.radiusMeters);
    if (body.reason !== undefined) update.reason = body.reason;
    if (body.notes !== undefined) update.notes = body.notes;
    if (body.isActive !== undefined || body.is_active !== undefined) {
      update.is_active = !!(body.isActive ?? body.is_active);
    }
    if (body.duration !== undefined) update.duration = body.duration === "temporary" ? "temporary" : "permanent";
    if (body.countyPin !== undefined) update.county_pin = body.countyPin;
    if (body.useClass !== undefined) update.use_class = body.useClass;

    const db = getAdmin();
    let { data, error } = await db
      .from("excluded_properties")
      .update(update)
      .eq("id", body.id)
      .select("*")
      .single();
    if (error && /duration|schema cache|does not exist/i.test(error.message)) {
      const { duration: _d, ...withoutDuration } = update;
      const retry = await db
        .from("excluded_properties")
        .update(withoutDuration)
        .eq("id", body.id)
        .select("*")
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, excludedProperty: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = requireOffice(req);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });

    const db = getAdmin();
    // Soft-delete by default; ?hard=1 removes the row
    if (searchParams.get("hard") === "1") {
      const { error } = await db.from("excluded_properties").delete().eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await db
        .from("excluded_properties")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
