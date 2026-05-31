/**
 * Google Routes API (Directions v2) — traffic-aware ordering + drive metrics.
 * Falls back to haversine nearest-neighbor when the API key is missing or the call fails.
 */

import { haversineMiles } from "@/lib/priority";

export type RouteStop = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  priorityScore?: number;
  status?: string;
};

export type OptimizedLeg = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  legMiles: number;
  cumulativeMiles: number;
  durationSeconds?: number;
};

export type OptimizeRouteResult = {
  strategy: string;
  totalStops: number;
  totalMiles: number;
  estimatedMinutes: number;
  orderedStops: OptimizedLeg[];
  mapsUrl?: string;
  encodedPolyline?: string;
};

function getRoutesApiKey(): string | undefined {
  return (
    process.env.GOOGLE_ROUTES_API_KEY ||
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  );
}

function latLng(lat: number, lng: number) {
  return { location: { latLng: { latitude: lat, longitude: lng } } };
}

function buildMapsDirectionsUrl(
  origin: { lat: number; lng: number },
  ordered: OptimizedLeg[]
): string | undefined {
  if (ordered.length === 0) return undefined;
  const last = ordered[ordered.length - 1];
  const params = new URLSearchParams({
    api: "1",
    origin: `${origin.lat},${origin.lng}`,
    destination: `${last.lat},${last.lng}`,
    travelmode: "driving",
  });
  if (ordered.length > 1) {
    const waypoints = ordered
      .slice(0, -1)
      .map((s) => `${s.lat},${s.lng}`)
      .join("|");
    params.set("waypoints", waypoints);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Haversine nearest-neighbor fallback (same logic as legacy v1). */
export function optimizeRouteHaversine(
  origin: { lat: number; lng: number },
  stops: RouteStop[],
  maxStops: number
): OptimizeRouteResult {
  const weighted = [...stops]
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .map((s) => {
      const dist = haversineMiles(origin.lat, origin.lng, s.lat, s.lng);
      const priority = s.priorityScore ?? 0;
      return { ...s, _seedScore: priority - dist * 8 };
    })
    .sort((a, b) => b._seedScore - a._seedScore)
    .slice(0, maxStops);

  const remaining = [...weighted];
  const ordered: OptimizedLeg[] = [];
  let curLat = origin.lat;
  let curLng = origin.lng;
  let totalMiles = 0;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i += 1) {
      const c = remaining[i];
      const d = haversineMiles(curLat, curLng, c.lat, c.lng);
      const p = c.priorityScore ?? 0;
      const cost = d - p / 200;
      if (cost < bestCost) {
        bestCost = cost;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    const leg = haversineMiles(curLat, curLng, next.lat, next.lng);
    totalMiles += leg;
    ordered.push({
      id: next.id,
      lat: next.lat,
      lng: next.lng,
      label: next.label,
      legMiles: Math.round(leg * 10) / 10,
      cumulativeMiles: Math.round(totalMiles * 10) / 10,
    });
    curLat = next.lat;
    curLng = next.lng;
  }

  const estimatedMinutes = Math.round((totalMiles * 1.3) / 35 * 60);
  return {
    strategy: "nearest_neighbor_priority_weighted_v1",
    totalStops: ordered.length,
    totalMiles: Math.round(totalMiles * 10) / 10,
    estimatedMinutes,
    orderedStops: ordered,
    mapsUrl: buildMapsDirectionsUrl(origin, ordered),
  };
}

type GoogleRoutesResponse = {
  routes?: Array<{
    distanceMeters?: number;
    duration?: string;
    optimizedIntermediateWaypointIndex?: number[];
    polyline?: { encodedPolyline?: string };
    legs?: Array<{ distanceMeters?: number; duration?: string }>;
  }>;
  error?: { message?: string };
};

function parseDurationSeconds(duration?: string): number | undefined {
  if (!duration) return undefined;
  const m = duration.match(/^(\d+)s$/);
  return m ? parseInt(m[1], 10) : undefined;
}

/** Traffic-aware route via Google Routes API. */
export async function optimizeRouteGoogle(
  origin: { lat: number; lng: number },
  stops: RouteStop[],
  maxStops: number
): Promise<OptimizeRouteResult | null> {
  const apiKey = getRoutesApiKey();
  if (!apiKey) return null;

  const usable = stops
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .slice(0, maxStops);
  if (usable.length === 0) return null;

  const intermediates = usable.map((s) => latLng(s.lat, s.lng));

  const body = {
    origin: latLng(origin.lat, origin.lng),
    destination: latLng(origin.lat, origin.lng),
    intermediates,
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE_OPTIMAL",
    optimizeWaypointOrder: true,
    departureTime: new Date().toISOString(),
    computeAlternativeRoutes: false,
  };

  const fieldMask = [
    "routes.distanceMeters",
    "routes.duration",
    "routes.legs.distanceMeters",
    "routes.legs.duration",
    "routes.optimizedIntermediateWaypointIndex",
    "routes.polyline.encodedPolyline",
  ].join(",");

  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as GoogleRoutesResponse;
  if (!res.ok) {
    console.warn("[google-routes]", data?.error?.message ?? res.statusText);
    return null;
  }

  const route = data.routes?.[0];
  if (!route?.legs?.length) return null;

  const orderIdx =
    route.optimizedIntermediateWaypointIndex ??
    usable.map((_, i) => i);
  const orderedStopsInput = orderIdx.map((i) => usable[i]);

  const visitLegs = route.legs.slice(0, orderedStopsInput.length);
  const ordered: OptimizedLeg[] = [];
  let cumulativeMiles = 0;
  let totalSeconds = 0;

  visitLegs.forEach((leg, idx) => {
    const stop = orderedStopsInput[idx];
    const legMiles = (leg.distanceMeters ?? 0) / 1609.34;
    cumulativeMiles += legMiles;
    const legSec = parseDurationSeconds(leg.duration) ?? 0;
    totalSeconds += legSec;
    ordered.push({
      id: stop.id,
      lat: stop.lat,
      lng: stop.lng,
      label: stop.label,
      legMiles: Math.round(legMiles * 10) / 10,
      cumulativeMiles: Math.round(cumulativeMiles * 10) / 10,
      durationSeconds: legSec,
    });
  });

  const totalMiles =
    route.distanceMeters != null
      ? Math.round((route.distanceMeters / 1609.34) * 10) / 10
      : Math.round(cumulativeMiles * 10) / 10;
  const routeSeconds = parseDurationSeconds(route.duration);
  const estimatedMinutes =
    routeSeconds != null
      ? Math.max(1, Math.round(routeSeconds / 60))
      : Math.max(1, Math.round(totalSeconds / 60));

  return {
    strategy: "google_routes_traffic_aware_v2",
    totalStops: ordered.length,
    totalMiles,
    estimatedMinutes,
    orderedStops: ordered,
    mapsUrl: buildMapsDirectionsUrl(origin, ordered),
    encodedPolyline: route.polyline?.encodedPolyline,
  };
}

export async function optimizeRoute(
  origin: { lat: number; lng: number },
  stops: RouteStop[],
  maxStops = 8
): Promise<OptimizeRouteResult> {
  try {
    const google = await optimizeRouteGoogle(origin, stops, maxStops);
    if (google && google.orderedStops.length > 0) return google;
  } catch (err) {
    console.warn("[google-routes] fallback to haversine:", err);
  }
  return optimizeRouteHaversine(origin, stops, maxStops);
}
