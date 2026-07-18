/**
 * GET  /api/techs        — list all technicians with user info + live status
 * POST /api/techs        — update own tech status/location (tech calls this)
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken, hashPassword } from "@/lib/jwt";
import { parseDispatchRole, parseInstallerFallback } from "@/lib/field-dispatch-role";
import { isAssignableTerritory } from "@/lib/territory-match";

async function assertAssignableTerritory(
  db: ReturnType<typeof getAdmin>,
  territoryId: string
): Promise<NextResponse | null> {
  const { data: territory } = await db
    .from("territories")
    .select("id, geometry, type, zip_codes")
    .eq("id", territoryId)
    .maybeSingle();
  if (!territory) {
    return NextResponse.json({ error: "Territory not found" }, { status: 404 });
  }
  if (!isAssignableTerritory(territory)) {
    return NextResponse.json(
      { error: "Exclusion zones cannot be assigned as tech territories" },
      { status: 400 }
    );
  }
  return null;
}

export async function GET() {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ techs: [] });
  }

  try {
    const db = getAdmin();
    const { data, error } = await db
      .from("technicians")
      .select("*, users(id, name, email, phone, role), territories(id, name, zip_codes, geometry)")
      .order("updated_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Fetch current job titles in one query if any techs have current_job_id
    const jobIds = (data ?? []).map((t) => t.current_job_id).filter(Boolean);
    let jobMap: Record<string, string> = {};
    if (jobIds.length > 0) {
      const { data: jobs } = await db
        .from("jobs")
        .select("id, customer_name, address")
        .in("id", jobIds);
      for (const j of jobs ?? []) {
        jobMap[j.id] = j.customer_name ?? j.address ?? "Job";
      }
    }

    const techs = (data ?? []).map((t) => ({
      id: t.id,
      userId: t.user_id,
      name: (t.users as any)?.name ?? "Unknown",
      email: (t.users as any)?.email ?? null,
      phone: (t.users as any)?.phone ?? null,
      status: t.status,
      lat: t.current_lat,
      lng: t.current_lng,
      currentJobId: t.current_job_id,
      currentJobName: t.current_job_id ? (jobMap[t.current_job_id] ?? "Active Job") : null,
      territoryId: t.territory_id,
      territoryName: (t.territories as any)?.name ?? null,
      territoryZipCodes: (t.territories as any)?.zip_codes ?? null,
      territoryGeometry: (t.territories as any)?.geometry ?? null,
      dispatchRole: parseDispatchRole(t.dispatch_role),
      installerFallback: parseInstallerFallback(t.installer_fallback),
      mapColor: t.map_color ?? null,
      workingSince: t.working_since ?? null,
      completedCount: t.completed_count ?? 0,
      returnTripCount: t.return_trip_count ?? 0,
      updatedAt: t.updated_at,
    }));

    return NextResponse.json({ techs });
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
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const body = await req.json();
    const {
      action,
      status,
      lat,
      lng,
      techId,
      territoryId,
      dispatchRole,
      installerFallback,
      mapColor,
      name,
      email,
      phone,
      password,
    } = body;

    if (!isSupabaseConfigured) {
      return NextResponse.json({ success: true, stored: false });
    }

    const db = getAdmin();

    const canManageDispatch =
      payload.role === "office" || payload.role === "admin" || payload.role === "owner";

    // Office/admin: create a new technician account
    if (action === "create_tech") {
      if (!canManageDispatch) {
        return NextResponse.json({ error: "Office role required to create technicians" }, { status: 403 });
      }
      if (!email || !password || !name) {
        return NextResponse.json({ error: "email, password, and name are required" }, { status: 400 });
      }
      const { data: existing } = await db.from("users").select("id").eq("email", email).maybeSingle();
      if (existing) return NextResponse.json({ error: "Email already registered" }, { status: 409 });

      const { data: newUser, error: insertErr } = await db
        .from("users")
        .insert({
          email,
          name,
          phone: phone || null,
          password_hash: hashPassword(password),
          role: "tech",
        })
        .select("id, email, name, phone, role")
        .single();

      if (insertErr || !newUser) {
        return NextResponse.json({ error: insertErr?.message ?? "Create failed" }, { status: 500 });
      }

      const techInsert: Record<string, unknown> = {
        user_id: newUser.id,
        status: "available",
        dispatch_role: parseDispatchRole(dispatchRole),
        installer_fallback: parseInstallerFallback(installerFallback),
      };
      if (territoryId) {
        const blocked = await assertAssignableTerritory(db, territoryId);
        if (blocked) return blocked;
        techInsert.territory_id = territoryId;
      }
      if (mapColor) techInsert.map_color = mapColor;

      const { error: techErr } = await db.from("technicians").insert(techInsert);
      if (techErr) {
        await db.from("users").delete().eq("id", newUser.id);
        return NextResponse.json({ error: techErr.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, userId: newUser.id });
    }

    // Office/admin: update technician profile, territory, role, map color
    if (action === "update_tech") {
      if (!canManageDispatch) {
        return NextResponse.json({ error: "Office role required to update technicians" }, { status: 403 });
      }
      if (!techId) return NextResponse.json({ error: "techId required" }, { status: 400 });

      const userUpdate: Record<string, unknown> = {};
      if (name !== undefined) userUpdate.name = name;
      if (phone !== undefined) userUpdate.phone = phone || null;
      if (email !== undefined) userUpdate.email = email;
      if (password) userUpdate.password_hash = hashPassword(password);

      if (Object.keys(userUpdate).length > 0) {
        const { error } = await db.from("users").update(userUpdate).eq("id", techId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }

      const techUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (status !== undefined) {
        const validStatuses = ["available", "working", "paused", "offline"];
        if (!validStatuses.includes(status)) {
          return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }
        techUpdate.status = status;
        if (status === "working") {
          techUpdate.working_since = new Date().toISOString();
        }
        if (status === "available" || status === "paused" || status === "offline") {
          techUpdate.working_since = null;
          if (status === "available" || status === "offline") {
            techUpdate.current_job_id = null;
          }
        }
      }
      if (territoryId !== undefined) {
        if (territoryId) {
          const blocked = await assertAssignableTerritory(db, territoryId);
          if (blocked) return blocked;
        }
        techUpdate.territory_id = territoryId || null;
      }
      if (dispatchRole !== undefined) techUpdate.dispatch_role = parseDispatchRole(dispatchRole);
      if (installerFallback !== undefined) {
        techUpdate.installer_fallback = parseInstallerFallback(installerFallback);
      }
      if (mapColor !== undefined) techUpdate.map_color = mapColor || null;

      if (Object.keys(techUpdate).length > 1) {
        const { error } = await db.from("technicians").update(techUpdate).eq("user_id", techId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    // Office/admin can assign territory to any tech
    if (action === "assign_territory") {
      if (!canManageDispatch) {
        return NextResponse.json({ error: "Office role required to assign territories" }, { status: 403 });
      }
      if (!techId) return NextResponse.json({ error: "techId required" }, { status: 400 });

      if (territoryId) {
        const blocked = await assertAssignableTerritory(db, territoryId);
        if (blocked) return blocked;
      }

      const { error } = await db
        .from("technicians")
        .update({ territory_id: territoryId ?? null, updated_at: new Date().toISOString() })
        .eq("user_id", techId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action === "assign_dispatch_role") {
      if (!canManageDispatch) {
        return NextResponse.json({ error: "Office role required to assign dispatch roles" }, { status: 403 });
      }
      if (!techId) return NextResponse.json({ error: "techId required" }, { status: 400 });
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (dispatchRole !== undefined) update.dispatch_role = parseDispatchRole(dispatchRole);
      if (installerFallback !== undefined) {
        update.installer_fallback = parseInstallerFallback(installerFallback);
      }
      if (mapColor !== undefined) update.map_color = mapColor || null;
      const { error } = await db.from("technicians").update(update).eq("user_id", techId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    // Tech updates own status / location
    const validStatuses = ["available", "working", "paused", "offline"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { completionChoice } = body;

    const update: any = { updated_at: new Date().toISOString() };
    if (status) update.status = status;
    if (lat != null) update.current_lat = lat;
    if (lng != null) update.current_lng = lng;

    // Track when tech starts working
    if (status === "working") {
      update.working_since = new Date().toISOString();
    }
    // Clear working_since when no longer working
    if (status === "available" || status === "paused" || status === "offline") {
      update.working_since = null;
    }
    // Increment completed_count or return_trip_count based on completion choice
    if (completionChoice === "complete") {
      const { data: techRow } = await db
        .from("technicians")
        .select("completed_count")
        .eq("user_id", payload.sub)
        .maybeSingle();
      update.completed_count = (techRow?.completed_count ?? 0) + 1;
      update.current_job_id = null;
    } else if (["temp_power", "return_grounding", "return_permanent"].includes(completionChoice ?? "")) {
      // Return trips: increment return_trip_count
      const { data: techRow } = await db
        .from("technicians")
        .select("return_trip_count")
        .eq("user_id", payload.sub)
        .maybeSingle();
      update.return_trip_count = (techRow?.return_trip_count ?? 0) + 1;
    }

    const { error } = await db
      .from("technicians")
      .update(update)
      .eq("user_id", payload.sub);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
