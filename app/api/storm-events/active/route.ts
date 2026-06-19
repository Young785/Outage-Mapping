/**
 * GET /api/storm-events/active — current storm session (any authenticated user)
 */

import { NextResponse } from "next/server";
import { extractBearerToken, verifyJWT } from "@/lib/jwt";
import { getActiveStormEvent } from "@/lib/storm-events";

export async function GET(req: Request) {
  const token = extractBearerToken(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    verifyJWT(token);
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const active = await getActiveStormEvent();
  return NextResponse.json({ activeEvent: active });
}
