import { NextResponse } from "next/server";
import { extractBearerToken, verifyJWT } from "@/lib/jwt";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try { verifyJWT(token); } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }
    const { id } = await params;
    const body = await req.json();

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });
    const db = getAdmin();
    const update: Record<string, unknown> = { last_updated_at: new Date().toISOString() };
    if (body.status !== undefined) update.status = body.status;
    if (body.streetAddress !== undefined) update.street_address = body.streetAddress;
    if (body.customerName !== undefined) update.customer_name = body.customerName;
    if (body.customerPhone !== undefined) update.customer_phone = body.customerPhone;
    if (body.leadSource !== undefined) update.lead_source = body.leadSource;
    if (body.assignedTechName !== undefined) update.assigned_tech_name = body.assignedTechName;
    if (body.notes !== undefined) update.office_notes = body.notes;
    if (body.externalJobStatus !== undefined) update.external_job_status = body.externalJobStatus;

    const { error } = await db.from("outages").update(update).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try { verifyJWT(token); } catch { return NextResponse.json({ error: "Invalid token" }, { status: 401 }); }
    const { id } = await params;

    if (!isSupabaseConfigured) return NextResponse.json({ success: true, stored: false });
    const db = getAdmin();
    const { error } = await db
      .from("outages")
      .update({ is_active: false, last_updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
