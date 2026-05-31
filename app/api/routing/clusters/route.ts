import { NextResponse } from "next/server";
import { extractBearerToken, verifyJWT } from "@/lib/jwt";
import { haversineMiles } from "@/lib/priority";

type StopInput = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  priorityScore?: number;
  status?: string;
};

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
  const stops = ((body?.stops as StopInput[]) ?? []).filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng)).slice(0, 200);
  const radiusMiles = Math.max(0.2, Math.min(Number(body?.radiusMiles ?? 0.8), 3));
  const minPoints = Math.max(2, Math.min(Number(body?.minPoints ?? 3), 8));

  if (stops.length < minPoints) {
    return NextResponse.json({ clusters: [], radiusMiles, minPoints });
  }

  const visited = new Set<number>();
  const clusters: Array<{
    id: string;
    size: number;
    centroid: { lat: number; lng: number };
    avgPriority: number;
    topStop?: StopInput;
    stops: StopInput[];
  }> = [];

  function neighbors(idx: number): number[] {
    const out: number[] = [];
    for (let j = 0; j < stops.length; j += 1) {
      if (j === idx) continue;
      if (haversineMiles(stops[idx].lat, stops[idx].lng, stops[j].lat, stops[j].lng) <= radiusMiles) out.push(j);
    }
    return out;
  }

  for (let i = 0; i < stops.length; i += 1) {
    if (visited.has(i)) continue;
    const seedN = neighbors(i);
    if (seedN.length + 1 < minPoints) continue;

    const memberIdx = new Set<number>([i, ...seedN]);
    const q = [...memberIdx];
    while (q.length > 0) {
      const cur = q.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const n = neighbors(cur);
      if (n.length + 1 >= minPoints) {
        for (const ni of n) {
          if (!memberIdx.has(ni)) {
            memberIdx.add(ni);
            q.push(ni);
          }
        }
      }
    }

    const points = Array.from(memberIdx).map((idx) => stops[idx]);
    const centroid = {
      lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
      lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
    };
    const avgPriority = points.reduce((s, p) => s + (p.priorityScore ?? 0), 0) / points.length;
    const topStop = [...points].sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))[0];
    clusters.push({
      id: `cluster-${clusters.length + 1}`,
      size: points.length,
      centroid,
      avgPriority: Math.round(avgPriority),
      topStop,
      stops: points,
    });
  }

  clusters.sort((a, b) => (b.avgPriority * b.size) - (a.avgPriority * a.size));

  return NextResponse.json({
    radiusMiles,
    minPoints,
    clusters: clusters.slice(0, 8),
  });
}

