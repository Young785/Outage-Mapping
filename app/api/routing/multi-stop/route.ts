import { NextResponse } from "next/server";
import { extractBearerToken, verifyJWT } from "@/lib/jwt";
import { optimizeRoute, type RouteStop } from "@/lib/google-routes";

function isAllowedRole(role: string) {
  return role === "tech" || role === "office" || role === "admin" || role === "owner";
}

export async function POST(req: Request) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let payload: { role: string };
  try {
    payload = verifyJWT(token) as { role: string };
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
  if (!isAllowedRole(payload.role)) {
    return NextResponse.json({ error: "Role not allowed" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const origin = body?.origin as { lat: number; lng: number } | undefined;
  const stops = (body?.stops as RouteStop[] | undefined) ?? [];
  const maxStops = Math.max(2, Math.min(Number(body?.maxStops ?? 8), 20));
  const excludeIds = new Set<string>(
    Array.isArray(body?.excludeIds) ? body.excludeIds.map(String) : []
  );

  if (!origin || origin.lat == null || origin.lng == null) {
    return NextResponse.json({ error: "origin lat/lng required" }, { status: 400 });
  }
  if (!Array.isArray(stops) || stops.length === 0) {
    return NextResponse.json({ error: "stops[] required" }, { status: 400 });
  }

  const usable = stops
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .filter((s) => !excludeIds.has(s.id))
    .slice(0, 100);

  if (usable.length === 0) {
    return NextResponse.json({ error: "No valid stops" }, { status: 400 });
  }

  const result = await optimizeRoute(origin, usable, maxStops);
  return NextResponse.json(result);
}
