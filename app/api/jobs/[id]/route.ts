/**
 * PATCH  /api/jobs/[id]  — update job status, assign tech, etc.
 * DELETE /api/jobs/[id]  — cancel a job
 */

import { NextResponse } from "next/server";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { verifyJWT, extractBearerToken } from "@/lib/jwt";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try { payload = verifyJWT(token); } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await req.json();
    const {
      status,
      assignedTechId,
      notes,
      isConfirmedOpportunity,
      priority,
      customerName,
      customerAddress,
      sortOrder,
    } = body;

    const validStatuses = ["pending", "assigned", "in_progress", "completed", "cancelled"];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });

    const db = getAdmin();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status) update.status = status;
    if (assignedTechId !== undefined) update.assigned_tech_id = assignedTechId;
    if (notes !== undefined) update.notes = notes;
    if (isConfirmedOpportunity !== undefined) update.is_confirmed_opportunity = isConfirmedOpportunity;
    if (priority !== undefined) update.priority = Math.min(4, Math.max(1, Number(priority)));
    if (customerName !== undefined) update.customer_name = customerName;
    if (customerAddress !== undefined) update.customer_address = customerAddress;
    if (sortOrder !== undefined) update.sort_order = Number(sortOrder);

    const { data: jobBefore, error: fetchErr } = await db.from("jobs").select("id, source").eq("id", id).maybeSingle();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });

    const { error } = await db.from("jobs").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (jobBefore?.source === "office") {
      const mirrorUpdate: Record<string, unknown> = { last_updated_at: new Date().toISOString() };
      if (customerName !== undefined) mirrorUpdate.customer_name = customerName;
      if (customerAddress !== undefined) mirrorUpdate.street_address = customerAddress;
      if (notes !== undefined) mirrorUpdate.cause = notes;
      if (status === "cancelled") mirrorUpdate.is_active = false;
      if (assignedTechId) {
        const { data: techUser } = await db.from("users").select("name").eq("id", assignedTechId).maybeSingle();
        if (techUser?.name) mirrorUpdate.assigned_tech_name = techUser.name;
      } else if (assignedTechId === null) {
        mirrorUpdate.assigned_tech_name = null;
      }
      if (Object.keys(mirrorUpdate).length > 1) {
        await db.from("outages").update(mirrorUpdate).eq("id", `office-${id}`);
      }
    }

    // If assigning to a tech, update technician status → working
    if (assignedTechId && status === "assigned") {
      await db
        .from("technicians")
        .update({ status: "working", current_job_id: id, updated_at: new Date().toISOString() })
        .eq("user_id", assignedTechId);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let payload;
    try { payload = verifyJWT(token); } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    if (payload.role !== "office" && payload.role !== "admin" && payload.role !== "owner") {
      return NextResponse.json({ error: "Office role required" }, { status: 403 });
    }

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });

    const db = getAdmin();
    const { error } = await db.from("jobs").update({ status: "cancelled" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
