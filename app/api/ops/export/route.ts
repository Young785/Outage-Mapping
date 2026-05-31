import { NextResponse } from "next/server";
import { extractBearerToken, verifyJWT } from "@/lib/jwt";
import { getAdmin, isSupabaseConfigured } from "@/lib/supabase";

function isOfficeRole(role: string) {
  return role === "office" || role === "admin" || role === "owner";
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, "\"\"")}"`;
  return s;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "id\n";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  });
  return lines.join("\n");
}

export async function GET(req: Request) {
  try {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let payload: any;
    try {
      payload = verifyJWT(token);
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
    if (!isOfficeRole(payload.role)) {
      return NextResponse.json({ error: "Office role required" }, { status: 403 });
    }

    if (!isSupabaseConfigured) {
      return new NextResponse("id\n", {
        status: 200,
        headers: { "Content-Type": "text/csv; charset=utf-8" },
      });
    }

    const { searchParams } = new URL(req.url);
    const kind = searchParams.get("kind") ?? "outages";
    const sinceDays = Math.max(1, Number(searchParams.get("sinceDays") ?? 30));
    const onlyActive = searchParams.get("onlyActive") === "true";
    const cutoff = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

    const db = getAdmin();
    let fileName = "export.csv";
    let csv = "id\n";

    if (kind === "outages") {
      let q = db
        .from("outages")
        .select("id,source,status,street_address,city,state,customers,priority_score,first_seen_at,last_updated_at,is_active")
        .gte("first_seen_at", cutoff)
        .order("first_seen_at", { ascending: false });
      if (onlyActive) q = q.eq("is_active", true);
      const { data, error } = await q.limit(5000);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      csv = toCsv(data ?? []);
      fileName = `outages-${sinceDays}d.csv`;
    } else if (kind === "jobs") {
      const { data, error } = await db
        .from("jobs")
        .select("id,source,status,customer_name,customer_address,customer_phone,priority,priority_score,is_confirmed_opportunity,created_at,updated_at")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      csv = toCsv(data ?? []);
      fileName = `jobs-${sinceDays}d.csv`;
    } else if (kind === "investigations") {
      const { data, error } = await db
        .from("investigations")
        .select("id,outage_id,tech_id,fault_type,cause_confirmed,action_taken,notes,visited_at,created_at")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      csv = toCsv(data ?? []);
      fileName = `investigations-${sinceDays}d.csv`;
    } else {
      return NextResponse.json({ error: "Invalid kind. Use outages|jobs|investigations" }, { status: 400 });
    }

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

