import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require an Authorization header (Bearer token presence check).
// Full JWT validation + role enforcement happens inside each route handler.
const PROTECTED_API_ROUTES = [
  "/api/techs",
  "/api/jobs",
  "/api/territories",
  "/api/admin",
  "/api/simulation",
  "/api/snapshots",
  // Status updates mutate DB state — require auth even though GET is public
  // (POST is distinguished inside the route handler itself)
  "/api/outages",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Normalize double slashes
  if (pathname.includes("//")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/\/+/g, "/");
    return NextResponse.redirect(url, 308);
  }

  // Presence-of-token check at the edge (fast rejection before hitting the route).
  // Role checks (office vs tech vs admin) are enforced inside each handler.
  const isProtectedApi = PROTECTED_API_ROUTES.some((r) => pathname.startsWith(r));
  if (isProtectedApi) {
    // GET /api/outages is intentionally public (live map data); only non-GET needs auth.
    const isPublicOutagesGet =
      pathname.startsWith("/api/outages") && request.method === "GET";
    if (!isPublicOutagesGet) {
      const auth = request.headers.get("authorization");
      if (!auth || !auth.startsWith("Bearer ")) {
        return NextResponse.json({ error: "Authorization required" }, { status: 401 });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
