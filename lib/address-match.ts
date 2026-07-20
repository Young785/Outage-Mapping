/**
 * Address / proximity matching for office call-in vs ArcGIS marker supersede.
 */

import { haversineMiles } from "./priority";

/** Normalize street address for fuzzy equality (lowercase, strip punctuation, collapse space). */
export function normalizeAddressKey(address: string | null | undefined): string {
  if (!address) return "";
  return address
    .toLowerCase()
    .replace(/\b(minnesota|mn)\b/g, " ")
    .replace(/\b(street|st\.?|avenue|ave\.?|road|rd\.?|drive|dr\.?|lane|ln\.?|court|ct\.?|boulevard|blvd\.?|way|circle|cir\.?)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when two addresses likely refer to the same property. */
export function addressesLikelyMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeAddressKey(a);
  const nb = normalizeAddressKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // Share the same leading street number + first token (street name)
  const ta = na.split(" ");
  const tb = nb.split(" ");
  if (ta.length < 2 || tb.length < 2) return false;
  return ta[0] === tb[0] && ta[1] === tb[1];
}

/** ~0.15 mi (~800 ft) — same parcel / driveway proximity for call-in vs ArcGIS pin. */
export const SUPERSEDE_RADIUS_MILES = 0.15;

export function isNearSameLocation(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  radiusMiles = SUPERSEDE_RADIUS_MILES
): boolean {
  return haversineMiles(a.lat, a.lng, b.lat, b.lng) <= radiusMiles;
}

export type SupersedeCandidate = {
  id: string;
  lat: number | null;
  lng: number | null;
  street_address?: string | null;
  source?: string | null;
  is_active?: boolean | null;
};

/**
 * Find ArcGIS / utility markers that should be hidden when an office triangle
 * is created at the same address or nearby coordinates.
 */
export function findSupersededUtilityMarkers(
  office: { lat: number | null; lng: number | null; address: string },
  candidates: SupersedeCandidate[]
): string[] {
  const utility = new Set(["xcel", "connexus", "arcgis"]);
  const hits: string[] = [];
  for (const c of candidates) {
    if (!c.id || !utility.has(String(c.source ?? "").toLowerCase())) continue;
    if (c.is_active === false) continue;
    const addressHit = addressesLikelyMatch(office.address, c.street_address);
    const nearHit =
      office.lat != null &&
      office.lng != null &&
      c.lat != null &&
      c.lng != null &&
      isNearSameLocation({ lat: office.lat, lng: office.lng }, { lat: c.lat, lng: c.lng });
    if (addressHit || nearHit) hits.push(c.id);
  }
  return hits;
}
