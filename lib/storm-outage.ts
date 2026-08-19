/**
 * Storm-map eligibility for utility outages.
 *
 * Xcel's public map now uses a lightning-bolt vs wrench legend, but the
 * ArcGIS layer we consume still supplies point geometry. Planned vs unplanned
 * is currently in `cause` ("Planned" / "Unplanned"), not only `outagetype`.
 */

export function isPlannedUtilityEvent(item: {
  cause?: string | null;
  outageType?: string | null;
  outage_type?: string | null;
  source?: string | null;
}): boolean {
  const source = String(item.source ?? "").toLowerCase();
  if (source && !["xcel", "connexus", "arcgis", "simulation", ""].includes(source)) {
    return false;
  }
  const cause = String(item.cause ?? "").toLowerCase().trim();
  const type = String(item.outageType ?? item.outage_type ?? "").toLowerCase();
  if (/\bunplanned\b/.test(cause)) return false;
  if (cause === "planned" || (/\bplanned\b/.test(cause) && !/\bunplanned\b/.test(cause))) {
    return true;
  }
  if (/\bplanned\b/.test(type) && !/\bunplanned\b/.test(type)) return true;
  return false;
}

/** WGS84 point that Google Maps / flutter_map can actually plot. */
export function isValidMapCoordinate(lat: unknown, lng: unknown): boolean {
  const la = Number(lat);
  const ln = Number(lng);
  return (
    Number.isFinite(la) &&
    Number.isFinite(ln) &&
    Math.abs(la) <= 90 &&
    Math.abs(ln) <= 180 &&
    !(la === 0 && ln === 0)
  );
}

export type RouteControl = "auto" | "manual";

export function parseRouteControl(value: unknown): RouteControl {
  return value === "manual" ? "manual" : "auto";
}
