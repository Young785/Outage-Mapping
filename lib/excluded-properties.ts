/**
 * Permanent excluded-property matching (address book + proximity).
 */

import { addressesLikelyMatch, normalizeAddressKey, isNearSameLocation } from "./address-match";
import { haversineMiles } from "./priority";

export type ExcludedProperty = {
  id: string;
  address?: string | null;
  address_key?: string | null;
  lat: number;
  lng: number;
  radius_meters?: number | null;
  county_pin?: string | null;
  use_class?: string | null;
  reason?: string | null;
  source?: string | null;
  notes?: string | null;
  is_active?: boolean | null;
};

export type LocatableProperty = {
  lat: number;
  lng: number;
  streetAddress?: string | null;
  countyPin?: string | null;
};

const METERS_PER_MILE = 1609.344;

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}

/** True when an outage/job location matches an active excluded property. */
export function matchesExcludedProperty(
  loc: LocatableProperty,
  excluded: ExcludedProperty
): boolean {
  if (excluded.is_active === false) return false;

  if (
    excluded.county_pin &&
    loc.countyPin &&
    String(excluded.county_pin).trim() === String(loc.countyPin).trim()
  ) {
    return true;
  }

  if (loc.streetAddress && excluded.address && addressesLikelyMatch(loc.streetAddress, excluded.address)) {
    return true;
  }

  if (loc.streetAddress && excluded.address_key) {
    const key = normalizeAddressKey(loc.streetAddress);
    if (key && key === excluded.address_key) return true;
  }

  const radiusM = Number(excluded.radius_meters ?? 30);
  const radiusMiles = metersToMiles(Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 30);
  return isNearSameLocation(
    { lat: loc.lat, lng: loc.lng },
    { lat: excluded.lat, lng: excluded.lng },
    radiusMiles
  );
}

export function findMatchingExcludedProperty(
  loc: LocatableProperty,
  list: ExcludedProperty[]
): ExcludedProperty | null {
  for (const row of list) {
    if (matchesExcludedProperty(loc, row)) return row;
  }
  return null;
}

export function isPermanentlyExcluded(
  loc: LocatableProperty,
  list: ExcludedProperty[]
): boolean {
  return findMatchingExcludedProperty(loc, list) != null;
}

/** Sort exclusions nearest-first for UI. */
export function sortExcludedByDistance(
  list: ExcludedProperty[],
  from: { lat: number; lng: number }
): ExcludedProperty[] {
  return [...list].sort(
    (a, b) =>
      haversineMiles(from.lat, from.lng, a.lat, a.lng) -
      haversineMiles(from.lat, from.lng, b.lat, b.lng)
  );
}
